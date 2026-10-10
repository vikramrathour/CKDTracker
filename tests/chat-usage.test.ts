import { describe, expect, it } from 'vitest'
import {
  checkExtractions,
  checkUsage,
  DEFAULT_DAILY_LIMIT,
  DEFAULT_EXTRACT_DAILY_LIMIT,
  hasUsage,
  readExtractLimit,
  releaseExtraction,
  reserveExtraction,
  DEFAULT_MONTHLY_TOKENS,
  readUsageLimits,
  reserveChatMessage,
  recordChatTokens,
  releaseChatMessage,
  usageKeys,
  UsageLimitError,
} from '@/lib/server/usage'
import type { Firestore } from 'firebase-admin/firestore'

describe('usage limits (pure)', () => {
  it('reads env with sane defaults', () => {
    expect(readUsageLimits({})).toEqual({ dailyMessages: DEFAULT_DAILY_LIMIT, monthlyTokens: DEFAULT_MONTHLY_TOKENS })
    expect(readUsageLimits({ CHAT_DAILY_LIMIT: '10', CHAT_MONTHLY_TOKENS: '5000' })).toEqual({ dailyMessages: 10, monthlyTokens: 5000 })
    expect(readUsageLimits({ CHAT_DAILY_LIMIT: '-1', CHAT_MONTHLY_TOKENS: 'abc' })).toEqual({ dailyMessages: 50, monthlyTokens: 2_000_000 })
  })

  it('keys by India day/month', () => {
    expect(usageKeys('u1', new Date('2026-10-31T18:29:00Z'))).toMatchObject({ day: '20261031', month: '202610', dayId: 'u1_20261031', monthId: 'u1_202610' })
    expect(usageKeys('u1', new Date('2026-10-31T18:31:00Z'))).toMatchObject({ day: '20261101', monthId: 'u1_202611' })
  })

  it('enforces the daily message cap and the monthly token cap', () => {
    const limits = { dailyMessages: 3, monthlyTokens: 1000 }
    expect(checkUsage(undefined, undefined, limits)).toBeNull()
    expect(checkUsage({ messages: 2 }, { totalTokens: 999 }, limits)).toBeNull()
    const d = checkUsage({ messages: 3 }, undefined, limits)
    expect(d).toBeInstanceOf(UsageLimitError)
    expect(d).toMatchObject({ status: 429, code: 'daily_limit' })
    expect(checkUsage({ messages: 0 }, { totalTokens: 1000 }, limits)).toMatchObject({ code: 'monthly_limit' })
  })
})

/** Minimal in-memory stand-in for the Admin Firestore transaction API. */
function fakeDb() {
  const store = new Map<string, Record<string, unknown>>()
  const ref = (path: string) => ({ path })
  const db = {
    store,
    doc: ref,
    async runTransaction(fn: (tx: unknown) => Promise<void>) {
      const writes: [string, Record<string, unknown>, boolean][] = []
      const tx = {
        getAll: async (...refs: { path: string }[]) => refs.map((r) => ({ data: () => store.get(r.path) })),
        set: (r: { path: string }, data: Record<string, unknown>, opts?: { merge?: boolean }) => writes.push([r.path, data, !!opts?.merge]),
      }
      await fn(tx)
      for (const [p, data, merge] of writes) store.set(p, merge ? { ...(store.get(p) ?? {}), ...data } : data)
    },
  }
  return db as unknown as Firestore & { store: Map<string, Record<string, unknown>> }
}

describe('usage transactions (fake Firestore)', () => {
  const now = new Date('2026-10-10T06:00:00Z')
  const limits = { dailyMessages: 2, monthlyTokens: 100 }

  it('counts messages, records tokens, refuses past the cap and releases on failure', async () => {
    const db = fakeDb()
    const keys = await reserveChatMessage(db, 'u1', now, limits)
    await recordChatTokens(db, keys, { tokensIn: 40, tokensOut: 10, totalTokens: 50 })
    expect(db.store.get('usage/u1_20261010')).toMatchObject({ messages: 1, totalTokens: 50, tokensIn: 40 })
    expect(db.store.get('usage/u1_202610')).toMatchObject({ messages: 1, totalTokens: 50, period: 'month' })

    await reserveChatMessage(db, 'u1', now, limits)
    await expect(reserveChatMessage(db, 'u1', now, limits)).rejects.toMatchObject({ code: 'daily_limit' })

    await releaseChatMessage(db, keys)
    expect(db.store.get('usage/u1_20261010')).toMatchObject({ messages: 1 })
  })

  it('refuses once the monthly tokens are used up, even on a new day', async () => {
    const db = fakeDb()
    const keys = await reserveChatMessage(db, 'u1', now, limits)
    await recordChatTokens(db, keys, { tokensIn: 90, tokensOut: 20, totalTokens: 110 })
    await expect(reserveChatMessage(db, 'u1', new Date('2026-10-12T06:00:00Z'), limits)).rejects.toMatchObject({ code: 'monthly_limit' })
  })
})

describe('chat reservation details', () => {
  const now = new Date('2026-10-10T06:00:00Z')

  it('reports the remaining monthly tokens and keeps other counters (extractions) intact', async () => {
    const db = fakeDb()
    db.store.set('usage/u1_20261010', { extractions: 4 })
    const first = await reserveChatMessage(db, 'u1', now, { dailyMessages: 5, monthlyTokens: 1000 })
    expect(first.remainingTokens).toBe(1000)
    await recordChatTokens(db, first, { tokensIn: 300, tokensOut: 50, totalTokens: 350 })
    const second = await reserveChatMessage(db, 'u1', now, { dailyMessages: 5, monthlyTokens: 1000 })
    expect(second.remainingTokens).toBe(650)
    expect(db.store.get('usage/u1_20261010')).toMatchObject({ extractions: 4, messages: 2 })
  })

  it('hasUsage only for non-zero usage', () => {
    expect(hasUsage(null)).toBe(false)
    expect(hasUsage({ tokensIn: 0, tokensOut: 0, totalTokens: 0 })).toBe(false)
    expect(hasUsage({ tokensIn: 10, tokensOut: 0, totalTokens: 10 })).toBe(true)
  })
})

describe('extraction quota', () => {
  const now = new Date('2026-10-10T06:00:00Z')

  it('reads EXTRACT_DAILY_LIMIT with a default of 30', () => {
    expect(readExtractLimit({})).toBe(DEFAULT_EXTRACT_DAILY_LIMIT)
    expect(DEFAULT_EXTRACT_DAILY_LIMIT).toBe(30)
    expect(readExtractLimit({ EXTRACT_DAILY_LIMIT: '5' })).toBe(5)
    expect(readExtractLimit({ EXTRACT_DAILY_LIMIT: '0' })).toBe(30)
  })

  it('counts extractions per day, refuses at the cap, and releases', async () => {
    const db = fakeDb()
    db.store.set('usage/u1_20261010', { messages: 3, totalTokens: 100 })
    const keys = await reserveExtraction(db, 'u1', now, 2)
    await reserveExtraction(db, 'u1', now, 2)
    expect(db.store.get('usage/u1_20261010')).toMatchObject({ extractions: 2, messages: 3, totalTokens: 100 })
    await expect(reserveExtraction(db, 'u1', now, 2)).rejects.toMatchObject({ status: 429, code: 'extract_limit' })

    await releaseExtraction(db, keys)
    expect(db.store.get('usage/u1_20261010')).toMatchObject({ extractions: 1 })
    // Next day starts fresh.
    await reserveExtraction(db, 'u1', new Date('2026-10-11T06:00:00Z'), 2)
    expect(db.store.get('usage/u1_20261011')).toMatchObject({ extractions: 1 })
  })

  it('chat messages and extractions do not share a cap', async () => {
    const db = fakeDb()
    await reserveExtraction(db, 'u1', now, 1)
    await expect(reserveChatMessage(db, 'u1', now, { dailyMessages: 1, monthlyTokens: 100 })).resolves.toBeDefined()
    expect(checkExtractions({ extractions: 0 }, 1)).toBeNull()
    expect(checkExtractions({ extractions: 1 }, 1)).toBeInstanceOf(UsageLimitError)
  })
})
