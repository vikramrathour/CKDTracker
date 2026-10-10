/**
 * Phase 2 migration: single-tenant users/{uid}/… → multi-tenant patients/{uid}/….
 *
 *   npx tsx scripts/migrate-to-patients.ts --dry-run            # every user, counts only
 *   npx tsx scripts/migrate-to-patients.ts --uid <uid> --dry-run
 *   npx tsx scripts/migrate-to-patients.ts --yes                # write (real project)
 *
 * Options:
 *   --dry-run        plan only; nothing is written
 *   --uid <uid>      migrate a single user
 *   --skip-storage   don't copy lab-pdfs/ files into the document vault
 *   --bucket <name>  Storage bucket (default NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
 *                    or <projectId>.appspot.com on the emulator)
 *   --yes            required to write to a real (non-emulator) project
 *
 * Credentials (real project), from the environment or .env.local:
 *   FIREBASE_SERVICE_ACCOUNT_B64 (base64 service-account JSON) or GOOGLE_APPLICATION_CREDENTIALS
 * Emulator: set FIRESTORE_EMULATOR_HOST (and FIREBASE_STORAGE_EMULATOR_HOST for
 * Storage); no credentials needed.
 *
 * What it does, per user with legacy labRecords or medications: see
 * scripts/lib/migrate-patients.ts. Idempotent; legacy data is left in place
 * for one release. Output is counts only — no names or medical values.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { applicationDefault, cert, initializeApp, type AppOptions } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { formatReport, listLegacyUids, migrateUser, type BucketLike } from './lib/migrate-patients'

const ROOT = resolve(__dirname, '..')

function fail(msg: string): never {
  console.error(`migrate-to-patients: ${msg}`)
  process.exit(1)
}

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  if (i === -1) return undefined
  const v = args[i + 1]
  if (!v || v.startsWith('--')) fail(`${name} needs a value`)
  return v
}

async function main() {
  const args = process.argv.slice(2)
  const known = new Set(['--dry-run', '--uid', '--skip-storage', '--bucket', '--yes'])
  for (const a of args) if (a.startsWith('--') && !known.has(a)) fail(`unknown option ${a}`)

  const dryRun = args.includes('--dry-run')
  const skipStorage = args.includes('--skip-storage')
  const onlyUid = argValue(args, '--uid')

  const envFile = resolve(ROOT, '.env.local')
  if (existsSync(envFile)) loadEnvFile(envFile)

  const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
  const projectId =
    process.env.GCLOUD_PROJECT ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    (emulator ? 'demo-ckd' : undefined)

  const options: AppOptions = { projectId }
  if (!emulator) {
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64
    const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS
    if (!b64 && !gac) fail('set FIREBASE_SERVICE_ACCOUNT_B64 or GOOGLE_APPLICATION_CREDENTIALS (or FIRESTORE_EMULATOR_HOST)')
    options.credential = b64 ? cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))) : applicationDefault()
    if (!dryRun && !args.includes('--yes')) {
      fail(`refusing to write to project "${projectId}" without --yes (run with --dry-run first)`)
    }
  }
  const app = initializeApp(options)
  const db = getFirestore(app)

  let bucket: BucketLike | null = null
  if (!skipStorage) {
    const bucketName =
      argValue(args, '--bucket') ||
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
      (emulator && projectId ? `${projectId}.appspot.com` : undefined)
    if (!bucketName) {
      console.warn('No Storage bucket configured (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET / --bucket); skipping document copy.')
    } else if (emulator && !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
      console.warn('FIRESTORE_EMULATOR_HOST is set but FIREBASE_STORAGE_EMULATOR_HOST is not; skipping document copy.')
    } else {
      bucket = getStorage(app).bucket(bucketName) as unknown as BucketLike
    }
  }

  console.log(
    `${dryRun ? 'DRY RUN' : 'MIGRATING'} · project ${projectId ?? '(default)'}${emulator ? ' (emulator)' : ''} · storage ${bucket ? 'on' : 'off'}`
  )

  const uids = onlyUid ? [onlyUid] : await listLegacyUids(db)
  const totals = { users: 0, migrated: 0, skipped: 0, conflicts: 0, failedVerify: 0, labRecords: 0, medications: 0, documents: 0 }

  for (const uid of uids) {
    totals.users++
    try {
      const r = await migrateUser(db, bucket, uid, { dryRun })
      console.log(formatReport(r))
      if (r.status === 'skipped-no-data') totals.skipped++
      else if (r.status === 'conflict') totals.conflicts++
      else {
        totals.migrated++
        totals.labRecords += r.labRecords.copied
        totals.medications += r.medications.copied
        totals.documents += r.documents.copied
        if (r.status === 'migrated' && !r.verified) totals.failedVerify++
      }
    } catch (err) {
      totals.conflicts++
      console.error(`[error] ${uid} | ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log(
    `\n${dryRun ? 'Would migrate' : 'Migrated'} ${totals.migrated}/${totals.users} user(s) · ` +
      `${totals.labRecords} lab record(s), ${totals.medications} medication(s), ${totals.documents} document(s) ` +
      `${dryRun ? 'to copy' : 'copied'} · ${totals.skipped} without legacy data · ${totals.conflicts} conflict/error(s)` +
      (dryRun ? '' : ` · ${totals.failedVerify} failed verification`)
  )
  if (totals.conflicts || totals.failedVerify) process.exit(2)
}

main().catch((err) => {
  console.error('migrate-to-patients failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
