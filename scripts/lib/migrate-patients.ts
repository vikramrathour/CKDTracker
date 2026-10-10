/**
 * Core of scripts/migrate-to-patients.ts (kept separate so the emulator suite
 * in tests/rules/migration.test.ts can run it).
 *
 * For one legacy user:
 *   users/{uid}/labRecords/*   → patients/{uid}/labRecords/*   (same ids, + createdBy)
 *   users/{uid}/medications/*  → patients/{uid}/medications/*  (same ids, + createdBy)
 *   lab-pdfs/{uid}/{file}      → patients/{uid}/documents/{docId}/{file}  + DocumentMeta
 *                                (docId derived from the legacy path → idempotent;
 *                                 record pdfPath rewritten to the new path)
 *   patients/{uid}             created from the users/{uid} profile
 *   patients/{uid}/members/{uid}  owner
 *   users/{uid}                activePatientId (if unset), migratedAt
 *
 * Idempotent and non-destructive: only missing targets are written, nothing
 * that already exists under patients/ is overwritten, and legacy data is left
 * in place (a later cleanup script removes it). Reports carry counts only.
 */
import { createHash } from 'node:crypto'
import { FieldValue, Timestamp, type DocumentReference, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore'
import { maskPhone } from '../../lib/phone'

/** Minimal slice of @google-cloud/storage's Bucket that the migration uses. */
export interface BucketLike {
  getFiles(opts: { prefix: string }): Promise<[FileLike[], ...unknown[]]>
  file(name: string): FileLike
}
export interface FileLike {
  name: string
  metadata: { contentType?: string; size?: string | number }
  exists(): Promise<[boolean]>
  copy(dest: FileLike): Promise<unknown>
}

export interface CollectionCounts {
  /** docs in the legacy collection */
  source: number
  /** already present under patients/{uid} before this run */
  existing: number
  /** written by this run (or that would be, in a dry run) */
  copied: number
}

export interface MigrationReport {
  uid: string
  status: 'migrated' | 'dry-run' | 'skipped-no-data' | 'conflict'
  patientCreated: boolean
  memberCreated: boolean
  labRecords: CollectionCounts
  medications: CollectionCounts
  documents: CollectionCounts & { storageSkipped: boolean }
  pdfPathsRewritten: number
  verified: boolean
  problems: string[]
}

const BATCH_LIMIT = 400

function emptyCounts(): CollectionCounts {
  return { source: 0, existing: 0, copied: 0 }
}

/** Profile date (Timestamp | Date | ISO string) → 'YYYY-MM-DD' or null. */
export function toDateOnly(value: unknown): string | null {
  if (!value) return null
  let d: Date | null = null
  if (value instanceof Timestamp) d = value.toDate()
  else if (value instanceof Date) d = value
  else if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
    const parsed = new Date(value)
    d = isNaN(parsed.getTime()) ? null : parsed
  } else if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as Timestamp).toDate === 'function') {
    d = (value as Timestamp).toDate()
  }
  return d ? d.toISOString().slice(0, 10) : null
}

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/** Deterministic DocumentMeta id for a legacy Storage path (Firestore-safe, 20 chars). */
export function documentIdFor(legacyPath: string): string {
  return 'm' + createHash('sha256').update(legacyPath).digest('hex').slice(0, 19)
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1) || 'document.pdf'
}

async function getAllChunked(db: Firestore, refs: DocumentReference[]): Promise<DocumentSnapshot[]> {
  const out: DocumentSnapshot[] = []
  for (let i = 0; i < refs.length; i += 300) {
    const chunk = refs.slice(i, i + 300)
    if (chunk.length) out.push(...(await db.getAll(...chunk)))
  }
  return out
}

/** Collects writes and commits them in batches under Firestore's 500-op limit. */
class Writer {
  private batch
  private ops = 0
  constructor(private db: Firestore) {
    this.batch = db.batch()
  }
  async set(ref: DocumentReference, data: Record<string, unknown>, merge = false) {
    if (merge) this.batch.set(ref, data, { merge: true })
    else this.batch.set(ref, data)
    if (++this.ops >= BATCH_LIMIT) await this.flush()
  }
  async flush() {
    if (this.ops === 0) return
    await this.batch.commit()
    this.batch = this.db.batch()
    this.ops = 0
  }
}

/** uids under users/ (including ones with subcollections but no profile doc). */
export async function listLegacyUids(db: Firestore): Promise<string[]> {
  const refs = await db.collection('users').listDocuments()
  return refs.map((r) => r.id).sort()
}

export async function migrateUser(
  db: Firestore,
  bucket: BucketLike | null,
  uid: string,
  opts: { dryRun: boolean }
): Promise<MigrationReport> {
  const report: MigrationReport = {
    uid,
    status: opts.dryRun ? 'dry-run' : 'migrated',
    patientCreated: false,
    memberCreated: false,
    labRecords: emptyCounts(),
    medications: emptyCounts(),
    documents: { ...emptyCounts(), storageSkipped: bucket === null },
    pdfPathsRewritten: 0,
    verified: false,
    problems: [],
  }

  const userRef = db.collection('users').doc(uid)
  const [profileSnap, labsSnap, medsSnap] = await Promise.all([
    userRef.get(),
    userRef.collection('labRecords').get(),
    userRef.collection('medications').get(),
  ])
  report.labRecords.source = labsSnap.size
  report.medications.source = medsSnap.size

  if (labsSnap.empty && medsSnap.empty) {
    report.status = 'skipped-no-data'
    report.verified = true
    return report
  }

  const profile = (profileSnap.exists ? profileSnap.data() : {}) ?? {}
  const patientRef = db.collection('patients').doc(uid)
  const memberRef = patientRef.collection('members').doc(uid)
  const [patientSnap, memberSnap] = await Promise.all([patientRef.get(), memberRef.get()])

  if (patientSnap.exists && patientSnap.get('ownerUid') !== uid) {
    report.status = 'conflict'
    report.problems.push('patients/{uid} exists with a different ownerUid')
    return report
  }
  if (memberSnap.exists && memberSnap.get('role') !== 'owner') {
    report.status = 'conflict'
    report.problems.push('members/{uid} exists without the owner role')
    return report
  }

  // ---- plan Storage copies
  type PlannedDoc = { file: FileLike; legacyPath: string; docId: string; newPath: string }
  let planned: PlannedDoc[] = []
  if (bucket) {
    const [files] = await bucket.getFiles({ prefix: `lab-pdfs/${uid}/` })
    planned = files
      .filter((f) => !f.name.endsWith('/'))
      .map((file) => {
        const docId = documentIdFor(file.name)
        return { file, legacyPath: file.name, docId, newPath: `patients/${uid}/documents/${docId}/${baseName(file.name)}` }
      })
  }
  report.documents.source = planned.length
  const pathMap = new Map(planned.map((p) => [p.legacyPath, p]))

  // ---- what already exists under patients/{uid}
  const labTargets = labsSnap.docs.map((d) => patientRef.collection('labRecords').doc(d.id))
  const medTargets = medsSnap.docs.map((d) => patientRef.collection('medications').doc(d.id))
  const docTargets = planned.map((p) => patientRef.collection('documents').doc(p.docId))
  const [labExisting, medExisting, docExisting] = await Promise.all([
    getAllChunked(db, labTargets),
    getAllChunked(db, medTargets),
    getAllChunked(db, docTargets),
  ])
  const labExists = new Set(labExisting.filter((s) => s.exists).map((s) => s.id))
  const medExists = new Set(medExisting.filter((s) => s.exists).map((s) => s.id))
  const docExists = new Set(docExisting.filter((s) => s.exists).map((s) => s.id))

  report.labRecords.existing = labExists.size
  report.labRecords.copied = labsSnap.size - labExists.size
  report.medications.existing = medExists.size
  report.medications.copied = medsSnap.size - medExists.size
  report.documents.existing = docExists.size
  report.documents.copied = planned.length - docExists.size
  report.patientCreated = !patientSnap.exists
  report.memberCreated = !memberSnap.exists

  // pdfPath → record id, for linking DocumentMeta.labRecordId
  const recordForPath = new Map<string, string>()
  for (const d of labsSnap.docs) {
    const p = d.get('pdfPath')
    if (typeof p === 'string' && pathMap.has(p)) recordForPath.set(p, d.id)
  }
  report.pdfPathsRewritten = labsSnap.docs.filter((d) => !labExists.has(d.id) && pathMap.has(d.get('pdfPath'))).length

  if (opts.dryRun) return report

  const w = new Writer(db)
  const displayName = str(profile.fullName, 100) || 'Me'

  // ---- patient + owner member
  if (!patientSnap.exists) {
    await w.set(patientRef, {
      ownerUid: uid,
      displayName,
      relationship: 'self',
      dateOfBirth: toDateOnly(profile.dateOfBirth),
      transplantDate: toDateOnly(profile.transplantDate),
      doctorName: str(profile.doctorName, 120),
      hospital: str(profile.doctorHospital, 160),
      createdAt: profile.createdAt instanceof Timestamp ? profile.createdAt : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      migratedAt: FieldValue.serverTimestamp(),
    })
  }
  if (!memberSnap.exists) {
    await w.set(memberRef, {
      uid,
      role: 'owner',
      displayName,
      // Masked: member docs are readable by every member of the circle.
      phone: maskPhone(str(profile.phoneNumber, 20), 2) || null,
      addedBy: uid,
      addedAt: FieldValue.serverTimestamp(),
    })
  }

  // ---- Storage: copy files first, so metadata never points at a missing object
  if (bucket) {
    for (const p of planned) {
      const dest = bucket.file(p.newPath)
      const [exists] = await dest.exists()
      if (!exists) await p.file.copy(dest)
      if (!docExists.has(p.docId)) {
        const size = Number(p.file.metadata.size ?? 0)
        await w.set(patientRef.collection('documents').doc(p.docId), {
          kind: 'lab-report',
          title: baseName(p.legacyPath).replace(/^\d{10,}-/, ''),
          fileName: baseName(p.legacyPath),
          storagePath: p.newPath,
          contentType: p.file.metadata.contentType || 'application/pdf',
          size: Number.isFinite(size) ? size : 0,
          documentDate: null,
          labRecordId: recordForPath.get(p.legacyPath) ?? null,
          source: 'migration',
          legacyPath: p.legacyPath,
          createdBy: uid,
          createdAt: FieldValue.serverTimestamp(),
        })
      }
    }
  }

  // ---- lab records (same ids)
  for (const d of labsSnap.docs) {
    if (labExists.has(d.id)) continue
    const data = { ...d.data() }
    if (!data.createdBy) data.createdBy = uid
    const mapped = typeof data.pdfPath === 'string' ? pathMap.get(data.pdfPath) : undefined
    if (mapped) data.pdfPath = mapped.newPath
    await w.set(patientRef.collection('labRecords').doc(d.id), data)
  }

  // ---- medications (same ids)
  for (const d of medsSnap.docs) {
    if (medExists.has(d.id)) continue
    const data = { ...d.data() }
    if (!data.createdBy) data.createdBy = uid
    await w.set(patientRef.collection('medications').doc(d.id), data)
  }

  // ---- account pointer
  const userFields: Record<string, unknown> = { migratedAt: FieldValue.serverTimestamp() }
  if (!profile.activePatientId) userFields.activePatientId = uid
  await w.set(userRef, userFields, true)

  await w.flush()

  // ---- verify
  const [labAfter, medAfter, docAfter, patientAfter, memberAfter] = await Promise.all([
    getAllChunked(db, labTargets),
    getAllChunked(db, medTargets),
    getAllChunked(db, docTargets),
    patientRef.get(),
    memberRef.get(),
  ])
  const missingLabs = labAfter.filter((s) => !s.exists).length
  const missingMeds = medAfter.filter((s) => !s.exists).length
  const missingDocs = docAfter.filter((s) => !s.exists).length
  if (missingLabs) report.problems.push(`${missingLabs} lab record(s) missing after copy`)
  if (missingMeds) report.problems.push(`${missingMeds} medication(s) missing after copy`)
  if (missingDocs) report.problems.push(`${missingDocs} document meta doc(s) missing after copy`)
  if (bucket) {
    let missingFiles = 0
    for (const p of planned) if (!(await bucket.file(p.newPath).exists())[0]) missingFiles++
    if (missingFiles) report.problems.push(`${missingFiles} storage file(s) missing after copy`)
  }
  if (!patientAfter.exists || patientAfter.get('ownerUid') !== uid) report.problems.push('patient doc missing or wrong owner')
  if (!memberAfter.exists || memberAfter.get('role') !== 'owner') report.problems.push('owner member doc missing')
  report.verified = report.problems.length === 0
  return report
}

/** One line per user, counts only (never medical values or names). */
export function formatReport(r: MigrationReport): string {
  const c = (x: CollectionCounts) => `${x.source} src / ${x.existing} existed / ${x.copied} ${r.status === 'dry-run' ? 'to copy' : 'copied'}`
  const parts = [
    `[${r.status}] ${r.uid}`,
    `labRecords ${c(r.labRecords)}`,
    `medications ${c(r.medications)}`,
    r.documents.storageSkipped ? 'documents (storage skipped)' : `documents ${c(r.documents)}`,
  ]
  if (r.status !== 'skipped-no-data') {
    parts.push(`patient ${r.patientCreated ? 'create' : 'exists'}`, `owner ${r.memberCreated ? 'create' : 'exists'}`)
    parts.push(`pdfPath rewrites ${r.pdfPathsRewritten}`)
  }
  if (r.status === 'migrated') parts.push(r.verified ? 'verified OK' : `VERIFY FAILED: ${r.problems.join('; ')}`)
  if (r.status === 'conflict') parts.push(`CONFLICT: ${r.problems.join('; ')}`)
  return parts.join(' | ')
}
