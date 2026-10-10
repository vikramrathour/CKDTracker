/**
 * One-time owner seeding via the Firebase Admin SDK.
 *
 * Reads the gitignored lib/personal/local.ts and writes into the owner's own
 * patient profile (pid == uid, the Phase 2 multi-tenant model):
 *   - patients/{uid}/medications/{slug(name)}  (deterministic ids -> idempotent reruns; createdBy = uid)
 *   - patients/{uid} { doctorName, hospital }  (merge)
 * If patients/{uid} doesn't exist yet (not onboarded / not migrated), it is
 * created with an owner member doc, and users/{uid}.activePatientId is set.
 *
 * Usage:
 *   npx tsx scripts/seed-owner.ts <uid> [--dry-run]
 *
 * Credentials (one of), read from the environment or from .env.local:
 *   FIREBASE_SERVICE_ACCOUNT_B64     base64 of the service-account JSON
 *   GOOGLE_APPLICATION_CREDENTIALS   path to the service-account JSON
 *
 * Emulator: set FIRESTORE_EMULATOR_HOST instead of credentials.
 *
 * --dry-run prints only counts, never medication details.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { pathToFileURL } from 'node:url'
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import type { PersonalData } from '../lib/personal/types'

const ROOT = resolve(__dirname, '..')

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'medication'
}

function fail(msg: string): never {
  console.error(`seed-owner: ${msg}`)
  process.exit(1)
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const uid = args.find((a) => !a.startsWith('--'))
  if (!uid) fail('usage: npx tsx scripts/seed-owner.ts <uid> [--dry-run]')

  const envFile = resolve(ROOT, '.env.local')
  if (existsSync(envFile)) loadEnvFile(envFile)

  const localPath = resolve(ROOT, 'lib/personal/local.ts')
  if (!existsSync(localPath)) {
    fail('lib/personal/local.ts not found. Copy lib/personal/sample.ts to local.ts and fill in real data first.')
  }
  const mod = (await import(pathToFileURL(localPath).href)) as { PERSONAL_DATA?: PersonalData; default?: { PERSONAL_DATA?: PersonalData } }
  const data = mod.PERSONAL_DATA ?? mod.default?.PERSONAL_DATA
  if (!data) fail('lib/personal/local.ts does not export PERSONAL_DATA')

  const meds = data.medications.map((m) => ({
    id: slugify(m.name),
    fields: {
      name: m.name,
      dose: m.dose,
      frequency: m.frequency,
      category: m.category,
      prescribedBy: m.prescribedBy,
      isActive: true,
    },
  }))
  const ids = new Set(meds.map((m) => m.id))
  if (ids.size !== meds.length) fail('two medications slugify to the same id; make their names distinct')

  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64
  const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS
  const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
  const hasCreds = Boolean(b64 || gac || emulator)

  if (dryRun) {
    console.log(`[dry-run] target: patients/${uid} (your own profile, pid == uid)`)
    console.log(`[dry-run] would write ${meds.length} medication doc(s) to patients/${uid}/medications (deterministic ids)`)
    console.log(`[dry-run] would merge into patients/${uid}: doctorName (${data.doctorName ? 'set' : 'empty'}), hospital (${data.doctorHospital ? 'set' : 'empty'})`)
    console.log(`[dry-run] credentials: ${hasCreds ? (emulator ? 'emulator' : 'found') : 'MISSING (set FIREBASE_SERVICE_ACCOUNT_B64 or GOOGLE_APPLICATION_CREDENTIALS)'}`)
    return
  }

  if (!hasCreds) fail('set FIREBASE_SERVICE_ACCOUNT_B64 or GOOGLE_APPLICATION_CREDENTIALS (service account required)')

  const projectId = process.env.GCLOUD_PROJECT || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || (emulator ? 'demo-ckd' : undefined)
  const app = emulator
    ? initializeApp({ projectId })
    : initializeApp({
        credential: b64 ? cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))) : applicationDefault(),
        projectId,
      })
  const db = getFirestore(app)

  const userRef = db.collection('users').doc(uid)
  const patientRef = db.collection('patients').doc(uid)
  const memberRef = patientRef.collection('members').doc(uid)
  const medsCol = patientRef.collection('medications')

  const [userSnap, patientSnap, memberSnap] = await Promise.all([userRef.get(), patientRef.get(), memberRef.get()])
  if (patientSnap.exists && patientSnap.get('ownerUid') !== uid) fail(`patients/${uid} belongs to another user`)

  const existing = meds.length ? await db.getAll(...meds.map((m) => medsCol.doc(m.id))) : []
  const existingIds = new Set(existing.filter((s) => s.exists).map((s) => s.id))

  const batch = db.batch()
  const displayName = (typeof userSnap.get('fullName') === 'string' && userSnap.get('fullName').trim()) || 'Me'
  if (!patientSnap.exists) {
    batch.set(patientRef, {
      ownerUid: uid,
      displayName,
      relationship: 'self',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  }
  if (!memberSnap.exists) {
    batch.set(memberRef, { uid, role: 'owner', displayName, phone: null, addedBy: uid, addedAt: FieldValue.serverTimestamp() })
  }
  for (const m of meds) {
    // Keep the original createdAt on reruns so list order stays stable
    const fields = existingIds.has(m.id)
      ? m.fields
      : { ...m.fields, createdBy: uid, createdAt: FieldValue.serverTimestamp() }
    batch.set(medsCol.doc(m.id), fields, { merge: true })
  }
  batch.set(
    patientRef,
    { doctorName: data.doctorName, hospital: data.doctorHospital, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  )
  if (!userSnap.get('activePatientId')) batch.set(userRef, { activePatientId: uid }, { merge: true })
  await batch.commit()

  console.log(
    `Wrote ${meds.length} medication doc(s) (${meds.length - existingIds.size} new, ${existingIds.size} updated) and doctor info for patients/${uid}` +
      (patientSnap.exists ? '' : ' (profile created)')
  )
}

main().catch((err) => {
  console.error('seed-owner failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
