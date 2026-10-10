import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp, type App } from 'firebase-admin/app'
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc as clientDoc, getDoc, getDocs, addDoc, serverTimestamp, type Firestore as ClientFirestore } from 'firebase/firestore'
import { getMetadata, ref, type FirebaseStorage } from 'firebase/storage'
import { documentIdFor, migrateUser, type BucketLike } from '../../scripts/lib/migrate-patients'
import { PROJECT_ID, createEnv } from './setup'

/**
 * scripts/migrate-to-patients.ts against the emulator with synthetic legacy
 * data: copy, idempotency, Storage copy + pdfPath rewrite, the CLI itself,
 * and that the migrated owner can use the data under the new rules.
 */

const BUCKET = `${PROJECT_ID}.appspot.com`
const ROOT = resolve(__dirname, '..', '..')

// Synthetic legacy users
const LEGACY = 'legacyuser000000000000000001' // labs + meds + pdfs + full profile
const MEDS_ONLY = 'legacymeds000000000000000002' // medications only, no profile doc
const EMPTY = 'legacyempty00000000000000003' // profile, no data
const CLI_USER = 'legacycli0000000000000000004' // migrated via the CLI

let app: App
let db: Firestore
let bucket: BucketLike
let env: RulesTestEnvironment

const PDF = Buffer.from('%PDF-1.4\n% synthetic\n')

async function seedLegacy(uid: string, opts: { labs: number; meds: number; pdfs: number; profile: boolean }) {
  const user = db.collection('users').doc(uid)
  if (opts.profile) {
    await user.set({
      fullName: 'Synthetic Person',
      email: 'synthetic@example.test',
      dateOfBirth: Timestamp.fromDate(new Date('1980-05-17T00:00:00Z')),
      transplantDate: '2019-02-03',
      doctorName: 'Dr Synthetic',
      doctorHospital: 'Example Hospital',
      createdAt: Timestamp.fromDate(new Date('2024-01-01T00:00:00Z')),
    })
  }
  const pdfPaths: string[] = []
  for (let i = 0; i < opts.pdfs; i++) {
    const path = `lab-pdfs/${uid}/17000000000${i}-report-${i}.pdf`
    await getStorage(app).bucket(BUCKET).file(path).save(PDF, { contentType: 'application/pdf' })
    pdfPaths.push(path)
  }
  for (let i = 0; i < opts.labs; i++) {
    await user.collection('labRecords').doc(`rec${i}`).set({
      recordDate: Timestamp.fromDate(new Date(Date.UTC(2024, i % 12, 1))),
      labName: 'Synthetic Lab',
      doctorName: '',
      notes: '',
      pdfPath: pdfPaths[i] ?? null,
      values: [{ testName: 'Creatinine', panel: 'kidney', value: 1 + i / 10, unit: 'mg/dL', isAbnormal: false }],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
  }
  for (let i = 0; i < opts.meds; i++) {
    await user.collection('medications').doc(`med-${i}`).set({
      name: `Synthetic med ${i}`,
      dose: '1 mg',
      frequency: 'daily',
      category: 'Other',
      isActive: true,
      createdAt: Timestamp.now(),
    })
  }
}

beforeAll(async () => {
  env = await createEnv({ storage: true })
  await env.clearFirestore()
  await env.clearStorage()
  app = initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET }, 'migration-test')
  db = getFirestore(app)
  bucket = getStorage(app).bucket(BUCKET) as unknown as BucketLike

  await seedLegacy(LEGACY, { labs: 5, meds: 3, pdfs: 2, profile: true })
  await seedLegacy(MEDS_ONLY, { labs: 0, meds: 2, pdfs: 0, profile: false })
  await seedLegacy(EMPTY, { labs: 0, meds: 0, pdfs: 0, profile: true })
  await seedLegacy(CLI_USER, { labs: 3, meds: 1, pdfs: 1, profile: true })
})

afterAll(async () => {
  await env?.cleanup()
  if (app) await deleteApp(app)
})

describe('migrateUser', () => {
  it('dry run reports the plan and writes nothing', async () => {
    const r = await migrateUser(db, bucket, LEGACY, { dryRun: true })
    expect(r.status).toBe('dry-run')
    expect(r.labRecords).toEqual({ source: 5, existing: 0, copied: 5 })
    expect(r.medications).toEqual({ source: 3, existing: 0, copied: 3 })
    expect(r.documents).toMatchObject({ source: 2, existing: 0, copied: 2 })
    expect(r.pdfPathsRewritten).toBe(2)
    expect((await db.doc(`patients/${LEGACY}`).get()).exists).toBe(false)
    expect((await db.collection(`patients/${LEGACY}/labRecords`).get()).size).toBe(0)
  })

  it('copies records, medications and PDFs with the same ids and verifies', async () => {
    const r = await migrateUser(db, bucket, LEGACY, { dryRun: false })
    expect(r.status).toBe('migrated')
    expect(r.verified).toBe(true)
    expect(r.problems).toEqual([])
    expect(r.patientCreated).toBe(true)
    expect(r.memberCreated).toBe(true)

    const labs = await db.collection(`patients/${LEGACY}/labRecords`).get()
    expect(labs.docs.map((d) => d.id).sort()).toEqual(['rec0', 'rec1', 'rec2', 'rec3', 'rec4'])
    expect(labs.docs.every((d) => d.get('createdBy') === LEGACY)).toBe(true)
    const meds = await db.collection(`patients/${LEGACY}/medications`).get()
    expect(meds.docs.map((d) => d.id).sort()).toEqual(['med-0', 'med-1', 'med-2'])

    const patient = (await db.doc(`patients/${LEGACY}`).get()).data()!
    expect(patient).toMatchObject({
      ownerUid: LEGACY,
      displayName: 'Synthetic Person',
      relationship: 'self',
      dateOfBirth: '1980-05-17',
      transplantDate: '2019-02-03',
      doctorName: 'Dr Synthetic',
      hospital: 'Example Hospital',
    })
    expect(patient.migratedAt).toBeInstanceOf(Timestamp)
    const owner = (await db.doc(`patients/${LEGACY}/members/${LEGACY}`).get()).data()!
    expect(owner).toMatchObject({ uid: LEGACY, role: 'owner', addedBy: LEGACY })

    // PDFs → document vault, pdfPath rewritten, meta linked to the record
    const legacyPath = `lab-pdfs/${LEGACY}/170000000000-report-0.pdf`
    const docId = documentIdFor(legacyPath)
    const newPath = `patients/${LEGACY}/documents/${docId}/170000000000-report-0.pdf`
    const rec0 = (await db.doc(`patients/${LEGACY}/labRecords/rec0`).get()).data()!
    expect(rec0.pdfPath).toBe(newPath)
    const meta = (await db.doc(`patients/${LEGACY}/documents/${docId}`).get()).data()!
    expect(meta).toMatchObject({ storagePath: newPath, labRecordId: 'rec0', source: 'migration', legacyPath, createdBy: LEGACY, contentType: 'application/pdf' })
    expect((await bucket.file(newPath).exists())[0]).toBe(true)
    expect((await db.collection(`patients/${LEGACY}/documents`).get()).size).toBe(2)

    // account pointer
    const user = (await db.doc(`users/${LEGACY}`).get()).data()!
    expect(user.activePatientId).toBe(LEGACY)
    expect(user.migratedAt).toBeInstanceOf(Timestamp)

    // legacy data left in place
    expect((await db.collection(`users/${LEGACY}/labRecords`).get()).size).toBe(5)
    expect((await bucket.file(legacyPath).exists())[0]).toBe(true)
  })

  it('is idempotent and never overwrites data edited after migration', async () => {
    await db.doc(`patients/${LEGACY}/labRecords/rec1`).update({ notes: 'edited after migration' })
    const r = await migrateUser(db, bucket, LEGACY, { dryRun: false })
    expect(r.verified).toBe(true)
    expect(r.patientCreated).toBe(false)
    expect(r.memberCreated).toBe(false)
    expect(r.labRecords).toEqual({ source: 5, existing: 5, copied: 0 })
    expect(r.medications).toEqual({ source: 3, existing: 3, copied: 0 })
    expect(r.documents).toMatchObject({ source: 2, existing: 2, copied: 0 })
    expect((await db.doc(`patients/${LEGACY}/labRecords/rec1`).get()).get('notes')).toBe('edited after migration')
    expect((await db.collection(`patients/${LEGACY}/labRecords`).get()).size).toBe(5)
  })

  it('picks up legacy records written after the first run', async () => {
    await db.doc(`users/${LEGACY}/labRecords/late`).set({ recordDate: Timestamp.now(), labName: 'Late', values: [], pdfPath: null })
    const r = await migrateUser(db, bucket, LEGACY, { dryRun: false })
    expect(r.labRecords).toEqual({ source: 6, existing: 5, copied: 1 })
    expect((await db.doc(`patients/${LEGACY}/labRecords/late`).get()).exists).toBe(true)
  })

  it('migrates a user with medications but no profile doc', async () => {
    const r = await migrateUser(db, bucket, MEDS_ONLY, { dryRun: false })
    expect(r.verified).toBe(true)
    expect(r.medications.copied).toBe(2)
    expect((await db.doc(`patients/${MEDS_ONLY}`).get()).get('displayName')).toBe('Me')
  })

  it('skips users without legacy data', async () => {
    const r = await migrateUser(db, bucket, EMPTY, { dryRun: false })
    expect(r.status).toBe('skipped-no-data')
    expect((await db.doc(`patients/${EMPTY}`).get()).exists).toBe(false)
  })

  it('refuses a pid owned by someone else', async () => {
    const uid = 'legacyclash0000000000000005'
    await seedLegacy(uid, { labs: 1, meds: 0, pdfs: 0, profile: false })
    await db.doc(`patients/${uid}`).set({ ownerUid: 'someoneelse', displayName: 'X' })
    const r = await migrateUser(db, bucket, uid, { dryRun: false })
    expect(r.status).toBe('conflict')
    expect((await db.collection(`patients/${uid}/labRecords`).get()).size).toBe(0)
  })
})

describe('migrated data under the new rules', () => {
  const as = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as ClientFirestore

  it('the owner can read and keep writing; strangers cannot read', async () => {
    const owner = as(LEGACY)
    await assertSucceeds(getDoc(clientDoc(owner, 'patients', LEGACY)))
    const snap = await assertSucceeds(getDocs(collection(owner, 'patients', LEGACY, 'labRecords')))
    expect(snap.size).toBe(6)
    await assertSucceeds(
      addDoc(collection(owner, 'patients', LEGACY, 'labRecords'), { recordDate: serverTimestamp(), labName: 'New', values: [], createdBy: LEGACY })
    )
    await assertFails(getDocs(collection(as(MEDS_ONLY), 'patients', LEGACY, 'labRecords')))
  })

  it('the owner can read the migrated PDF from the document vault', async () => {
    const legacyPath = `lab-pdfs/${LEGACY}/170000000000-report-0.pdf`
    const path = `patients/${LEGACY}/documents/${documentIdFor(legacyPath)}/170000000000-report-0.pdf`
    const storage = env.authenticatedContext(LEGACY).storage(`gs://${BUCKET}`) as unknown as FirebaseStorage
    await assertSucceeds(getMetadata(ref(storage, path)))
  })
})

describe('scripts/migrate-to-patients.ts (CLI)', () => {
  const run = (...args: string[]) =>
    spawnSync(`npx tsx scripts/migrate-to-patients.ts ${args.join(' ')}`, {
      cwd: ROOT,
      shell: true,
      encoding: 'utf8',
      env: { ...process.env, GCLOUD_PROJECT: PROJECT_ID },
    })

  it('dry-run, then migrate, then re-run as a no-op; prints counts only', { timeout: 180_000 }, async () => {
    const dry = run('--uid', CLI_USER, '--bucket', BUCKET, '--dry-run')
    expect(dry.status, dry.stderr).toBe(0)
    expect(dry.stdout).toContain('DRY RUN')
    expect(dry.stdout).toContain('labRecords 3 src / 0 existed / 3 to copy')
    expect((await db.doc(`patients/${CLI_USER}`).get()).exists).toBe(false)

    const real = run('--uid', CLI_USER, '--bucket', BUCKET)
    console.log(dry.stdout + real.stdout) // counts only; visible in the test log
    expect(real.status, real.stderr).toBe(0)
    expect(real.stdout).toContain('verified OK')
    expect(real.stdout).toContain('documents 1 src / 0 existed / 1 copied')
    // No names or values in the output
    expect(real.stdout).not.toMatch(/Synthetic Person|Dr Synthetic|Creatinine|mg\/dL/)
    expect((await db.collection(`patients/${CLI_USER}/labRecords`).get()).size).toBe(3)

    const again = run('--uid', CLI_USER, '--bucket', BUCKET)
    expect(again.status, again.stderr).toBe(0)
    expect(again.stdout).toContain('labRecords 3 src / 3 existed / 0 copied')
  })
})
