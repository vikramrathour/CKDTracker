import type { DocumentData, Firestore } from 'firebase-admin/firestore'
import type { ChatUsage } from '@/lib/server/chat/events'

/**
 * Per-user chat caps, stored server-only (firestore.rules: usage/** closed).
 *
 *   usage/{uid}_{YYYYMMDD}  { uid, period: 'day',   key, messages, tokensIn, tokensOut, totalTokens, extractions, updatedAt }
 *   usage/{uid}_{YYYYMM}    { uid, period: 'month', key, messages, tokensIn, tokensOut, totalTokens, updatedAt }
 *
 * Days and months follow India time (Asia/Kolkata, UTC+5:30, no DST), so the
 * daily cap resets at local midnight for the people using the app.
 *
 * Flow: reserveChatMessage() (transaction: check both caps, count the message)
 * → model call(s) → recordChatTokens() with whatever usageMetadata totals were
 * reported, even when the call later failed; only a failure that consumed no
 * tokens at all gives the message back with releaseChatMessage().
 *
 * Lab extraction: reserveExtraction() right before each Gemini call
 * (EXTRACT_DAILY_LIMIT per day, default 30).
 *
 * Pure helpers (keys, limits, checks) are exported for unit tests. This module
 * has no `server-only` import so it can be tested; it is only used by API routes.
 */

export const DEFAULT_DAILY_LIMIT = 50
export const DEFAULT_MONTHLY_TOKENS = 2_000_000
/** Gemini-backed lab extractions per user per (India) day. */
export const DEFAULT_EXTRACT_DAILY_LIMIT = 30
const IST_OFFSET_MS = 330 * 60 * 1000

export interface UsageLimits {
  dailyMessages: number
  monthlyTokens: number
}

export interface UsageKeys {
  uid: string
  day: string
  month: string
  dayId: string
  monthId: string
}

/** reserveChatMessage() result: the keys plus what is left of the monthly token cap. */
export interface ChatReservation extends UsageKeys {
  /** Monthly tokens still available when the message was reserved (>= 1). */
  remainingTokens: number
}

export interface UsageCounters {
  messages?: number
  totalTokens?: number
}

export type UsageLimitCode = 'daily_limit' | 'monthly_limit' | 'extract_limit'

export class UsageLimitError extends Error {
  status = 429
  code: UsageLimitCode

  constructor(code: UsageLimitCode, message: string) {
    super(message)
    this.name = 'UsageLimitError'
    this.code = code
  }
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = raw == null || raw === '' ? NaN : Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

export function readUsageLimits(env: Record<string, string | undefined> = process.env): UsageLimits {
  return {
    dailyMessages: positiveInt(env.CHAT_DAILY_LIMIT, DEFAULT_DAILY_LIMIT),
    monthlyTokens: positiveInt(env.CHAT_MONTHLY_TOKENS, DEFAULT_MONTHLY_TOKENS),
  }
}

export function usageKeys(uid: string, now: Date = new Date()): UsageKeys {
  const ist = new Date(now.getTime() + IST_OFFSET_MS).toISOString() // YYYY-MM-DDTHH…
  const day = ist.slice(0, 10).replace(/-/g, '')
  const month = day.slice(0, 6)
  return { uid, day, month, dayId: `${uid}_${day}`, monthId: `${uid}_${month}` }
}

/** null when allowed, else the error to throw. */
export function checkUsage(
  daily: UsageCounters | undefined,
  monthly: UsageCounters | undefined,
  limits: UsageLimits
): UsageLimitError | null {
  if ((daily?.messages ?? 0) >= limits.dailyMessages) {
    return new UsageLimitError(
      'daily_limit',
      `You've reached today's limit of ${limits.dailyMessages} chat messages. It resets at midnight (India time).`
    )
  }
  if ((monthly?.totalTokens ?? 0) >= limits.monthlyTokens) {
    return new UsageLimitError(
      'monthly_limit',
      "You've used this month's chat allowance. It resets on the 1st. Your reports and charts are still available."
    )
  }
  return null
}

function counters(data: DocumentData | undefined) {
  return {
    messages: Number(data?.messages) || 0,
    extractions: Number(data?.extractions) || 0,
    tokensIn: Number(data?.tokensIn) || 0,
    tokensOut: Number(data?.tokensOut) || 0,
    totalTokens: Number(data?.totalTokens) || 0,
  }
}

/** Check both caps and count one message, atomically. Throws UsageLimitError (429). */
export async function reserveChatMessage(
  db: Firestore,
  uid: string,
  now: Date = new Date(),
  limits: UsageLimits = readUsageLimits()
): Promise<ChatReservation> {
  const keys = usageKeys(uid, now)
  const dayRef = db.doc(`usage/${keys.dayId}`)
  const monthRef = db.doc(`usage/${keys.monthId}`)
  let remainingTokens = limits.monthlyTokens
  await db.runTransaction(async (tx) => {
    const [d, m] = await tx.getAll(dayRef, monthRef)
    const day = counters(d.data())
    const month = counters(m.data())
    const err = checkUsage(day, month, limits)
    if (err) throw err
    remainingTokens = Math.max(1, limits.monthlyTokens - month.totalTokens)
    tx.set(dayRef, { uid, period: 'day', key: keys.day, ...day, messages: day.messages + 1, updatedAt: now }, { merge: true })
    tx.set(monthRef, { uid, period: 'month', key: keys.month, ...month, messages: month.messages + 1, updatedAt: now }, { merge: true })
  })
  return { ...keys, remainingTokens }
}

async function adjust(db: Firestore, keys: UsageKeys, delta: { messages?: number } & Partial<ChatUsage>) {
  if (!delta.messages && !delta.tokensIn && !delta.tokensOut && !delta.totalTokens) return
  const refs = [db.doc(`usage/${keys.dayId}`), db.doc(`usage/${keys.monthId}`)]
  await db.runTransaction(async (tx) => {
    const snaps = await tx.getAll(...refs)
    snaps.forEach((snap, i) => {
      const c = counters(snap.data())
      tx.set(
        refs[i],
        {
          messages: Math.max(0, c.messages + (delta.messages ?? 0)),
          tokensIn: c.tokensIn + (delta.tokensIn ?? 0),
          tokensOut: c.tokensOut + (delta.tokensOut ?? 0),
          totalTokens: c.totalTokens + (delta.totalTokens ?? 0),
          updatedAt: new Date(),
        },
        { merge: true }
      )
    })
  })
}

/** True when the model reported any token usage worth recording. */
export function hasUsage(usage: Partial<ChatUsage> | null | undefined): usage is ChatUsage {
  return !!usage && ((usage.totalTokens ?? 0) > 0 || (usage.tokensIn ?? 0) > 0 || (usage.tokensOut ?? 0) > 0)
}

/** Add the model's token usage (from usageMetadata) to both counters. */
export function recordChatTokens(db: Firestore, keys: UsageKeys, usage: ChatUsage): Promise<void> {
  return adjust(db, keys, { tokensIn: usage.tokensIn, tokensOut: usage.tokensOut, totalTokens: usage.totalTokens })
}

/** Give back a reserved message when the model call failed before producing anything. */
export function releaseChatMessage(db: Firestore, keys: UsageKeys): Promise<void> {
  return adjust(db, keys, { messages: -1 })
}

// ------------------------------------------------------------ lab extraction

/**
 * AI lab extraction quota: usage/{uid}_{YYYYMMDD}.extractions, counted only
 * when Gemini is actually about to be called (the offline regex parser is
 * free). Shared by /api/documents/extract and the legacy /api/pdf/parse.
 */
export function readExtractLimit(env: Record<string, string | undefined> = process.env): number {
  return positiveInt(env.EXTRACT_DAILY_LIMIT, DEFAULT_EXTRACT_DAILY_LIMIT)
}

export function checkExtractions(daily: { extractions?: number } | undefined, limit: number): UsageLimitError | null {
  if ((daily?.extractions ?? 0) >= limit) {
    return new UsageLimitError(
      'extract_limit',
      `You've reached today's limit of ${limit} AI report readings. It resets at midnight (India time); you can still enter values by hand.`
    )
  }
  return null
}

/** Check the daily extraction cap and count one, atomically. Throws UsageLimitError (429). */
export async function reserveExtraction(
  db: Firestore,
  uid: string,
  now: Date = new Date(),
  limit: number = readExtractLimit()
): Promise<UsageKeys> {
  const keys = usageKeys(uid, now)
  const dayRef = db.doc(`usage/${keys.dayId}`)
  await db.runTransaction(async (tx) => {
    const [d] = await tx.getAll(dayRef)
    const day = counters(d.data())
    const err = checkExtractions(day, limit)
    if (err) throw err
    tx.set(dayRef, { uid, period: 'day', key: keys.day, extractions: day.extractions + 1, updatedAt: now }, { merge: true })
  })
  return keys
}

/** Give back a reserved extraction (only when Gemini was never called). */
export async function releaseExtraction(db: Firestore, keys: UsageKeys): Promise<void> {
  const dayRef = db.doc(`usage/${keys.dayId}`)
  await db.runTransaction(async (tx) => {
    const [d] = await tx.getAll(dayRef)
    const day = counters(d.data())
    tx.set(dayRef, { extractions: Math.max(0, day.extractions - 1), updatedAt: new Date() }, { merge: true })
  })
}
