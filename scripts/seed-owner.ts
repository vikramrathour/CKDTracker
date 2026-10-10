/**
 * One-time owner seeding via the Firebase Admin SDK.
 *
 * Reads the gitignored lib/personal/local.ts and writes:
 *   - users/{uid}/medications/{slug(name)}  (deterministic ids -> idempotent reruns)
 *   - users/{uid} { doctorName, doctorHospital }  (merge)
 *
 * Usage:
 *   npx tsx scripts/seed-owner.ts <uid> [--dry-run]
 *
 * Credentials (one of), read from the environment or from .env.local:
 *   FIREBASE_SERVICE_ACCOUNT_B64     base64 of the service-account JSON
 *   GOOGLE_APPLICATION_CREDENTIALS   path to the service-account JSON
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
  const hasCreds = Boolean(b64 || gac)

  if (dryRun) {
    console.log(`[dry-run] target: users/${uid}`)
    console.log(`[dry-run] would write ${meds.length} medication doc(s) to users/${uid}/medications (deterministic ids)`)
    console.log(`[dry-run] would merge into users/${uid}: doctorName (${data.doctorName ? 'set' : 'empty'}), doctorHospital (${data.doctorHospital ? 'set' : 'empty'})`)
    console.log(`[dry-run] credentials: ${hasCreds ? 'found' : 'MISSING (set FIREBASE_SERVICE_ACCOUNT_B64 or GOOGLE_APPLICATION_CREDENTIALS)'}`)
    return
  }

  if (!hasCreds) fail('set FIREBASE_SERVICE_ACCOUNT_B64 or GOOGLE_APPLICATION_CREDENTIALS (service account required)')

  const credential = b64
    ? cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf8')))
    : applicationDefault()
  const app = initializeApp({ credential, projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID })
  const db = getFirestore(app)

  const userRef = db.collection('users').doc(uid)
  const medsCol = userRef.collection('medications')
  const existing = meds.length ? await db.getAll(...meds.map((m) => medsCol.doc(m.id))) : []
  const existingIds = new Set(existing.filter((s) => s.exists).map((s) => s.id))

  const batch = db.batch()
  for (const m of meds) {
    // Keep the original createdAt on reruns so list order stays stable
    const fields = existingIds.has(m.id) ? m.fields : { ...m.fields, createdAt: FieldValue.serverTimestamp() }
    batch.set(medsCol.doc(m.id), fields, { merge: true })
  }
  batch.set(userRef, { doctorName: data.doctorName, doctorHospital: data.doctorHospital }, { merge: true })
  await batch.commit()

  console.log(`Wrote ${meds.length} medication doc(s) (${meds.length - existingIds.size} new, ${existingIds.size} updated) and doctor info for users/${uid}`)
}

main().catch((err) => {
  console.error('seed-owner failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
