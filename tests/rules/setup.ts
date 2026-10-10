import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, setDoc, Timestamp } from 'firebase/firestore'

export const PROJECT_ID = 'demo-ckd'
const ROOT = resolve(__dirname, '..', '..')

function hostPort(envVar: string, fallback: string): { host: string; port: number } {
  const raw = process.env[envVar] || fallback
  const i = raw.lastIndexOf(':')
  return { host: raw.slice(0, i).replace(/^\[|\]$/g, ''), port: Number(raw.slice(i + 1)) }
}

export async function createEnv(opts: { storage?: boolean } = {}): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(ROOT, 'firestore.rules'), 'utf8'),
      ...hostPort('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8080'),
    },
    ...(opts.storage
      ? {
          storage: {
            rules: readFileSync(resolve(ROOT, 'storage.rules'), 'utf8'),
            ...hostPort('FIREBASE_STORAGE_EMULATOR_HOST', '127.0.0.1:9199'),
          },
        }
      : {}),
  })
}

// Synthetic users. Real Firebase uids are 28 alphanumerics; these just need to
// be alphanumeric so the `${uid}_suffix` pid pattern applies.
export const ALICE = 'alice0000000000000000000001' // owner
export const BOB = 'bob00000000000000000000002' // editor
export const CAROL = 'carol000000000000000000003' // viewer
export const MALLORY = 'mallory0000000000000000004' // stranger

export const PID = ALICE // Alice's own profile

/** Seed patients/{PID} with Alice as owner, Bob editor, Carol viewer, plus one lab record. */
export async function seedCircle(env: RulesTestEnvironment): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    const now = Timestamp.now()
    await setDoc(doc(db, 'patients', PID), {
      ownerUid: ALICE,
      displayName: 'Test Patient',
      relationship: 'self',
      createdAt: now,
    })
    const members: [string, string][] = [
      [ALICE, 'owner'],
      [BOB, 'editor'],
      [CAROL, 'viewer'],
    ]
    for (const [uid, role] of members) {
      await setDoc(doc(db, 'patients', PID, 'members', uid), {
        uid,
        role,
        displayName: uid.replace(/\d+$/, ''),
        addedBy: ALICE,
        addedAt: now,
      })
    }
    await setDoc(doc(db, 'patients', PID, 'labRecords', 'rec1'), {
      recordDate: now,
      labName: 'Synthetic Lab',
      values: [{ testName: 'Creatinine', panel: 'kidney', value: 1.1, unit: 'mg/dL', isAbnormal: false }],
      createdBy: ALICE,
      createdAt: now,
    })
  })
}
