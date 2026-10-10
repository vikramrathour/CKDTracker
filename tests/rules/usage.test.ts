import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp, type App } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { releaseExtraction, reserveChatMessage, reserveExtraction, usageKeys } from '@/lib/server/usage'
import { PROJECT_ID, createEnv } from './setup'

/**
 * Usage caps against the Firestore emulator (real transactions, real
 * contention): concurrent requests at the cap must not over-admit.
 */

const UID = 'usageuser0000000000000000001'
const NOW = new Date('2026-10-10T06:00:00Z')

let app: App
let db: Firestore
let env: RulesTestEnvironment

beforeAll(async () => {
  app = initializeApp({ projectId: PROJECT_ID }, 'usage-test')
  db = getFirestore(app)
  env = await createEnv()
})

afterAll(async () => {
  await env?.cleanup()
  if (app) await deleteApp(app)
})

beforeEach(async () => {
  await env.clearFirestore()
})

describe('reserveChatMessage under contention', () => {
  it('at limit-1, concurrent reservations let exactly one through', async () => {
    const limits = { dailyMessages: 5, monthlyTokens: 1_000_000 }
    const keys = usageKeys(UID, NOW)
    await db.doc(`usage/${keys.dayId}`).set({ uid: UID, period: 'day', key: keys.day, messages: 4 })

    const results = await Promise.allSettled(Array.from({ length: 6 }, () => reserveChatMessage(db, UID, NOW, limits)))
    const ok = results.filter((r) => r.status === 'fulfilled')
    const refused = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
    expect(ok).toHaveLength(1)
    expect(refused).toHaveLength(5)
    for (const r of refused) expect(r.reason).toMatchObject({ code: 'daily_limit', status: 429 })
    expect((await db.doc(`usage/${keys.dayId}`).get()).get('messages')).toBe(5)
    expect((await db.doc(`usage/${keys.monthId}`).get()).get('messages')).toBe(1)
  })
})

describe('reserveExtraction under contention', () => {
  it('at limit-1, concurrent reservations let exactly one through; release gives it back', async () => {
    const keys = usageKeys(UID, NOW)
    await db.doc(`usage/${keys.dayId}`).set({ uid: UID, messages: 2, extractions: 2 })

    const results = await Promise.allSettled(Array.from({ length: 5 }, () => reserveExtraction(db, UID, NOW, 3)))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const day = (await db.doc(`usage/${keys.dayId}`).get()).data()
    expect(day).toMatchObject({ extractions: 3, messages: 2 })

    await releaseExtraction(db, keys)
    expect((await db.doc(`usage/${keys.dayId}`).get()).get('extractions')).toBe(2)
  })
})
