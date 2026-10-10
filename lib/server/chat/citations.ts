import type { LabRecord } from '@/lib/types/lab-record'
import type { Citation } from './events'

const GROUP_RE = /\[([0-9]{4}-[0-9]{2}-[0-9]{2}(?:\s*[,;]\s*[0-9]{4}-[0-9]{2}-[0-9]{2})*)\]/g
const DATE_RE = /[0-9]{4}-[0-9]{2}-[0-9]{2}/g

/** Every YYYY-MM-DD inside [..] brackets, in first-seen order (accepts "[d1, d2]"). */
export function extractCitedDates(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of Array.from(text.matchAll(GROUP_RE))) {
    for (const d of m[1].match(DATE_RE) ?? []) {
      if (!seen.has(d) && isRealDate(d)) {
        seen.add(d)
        out.push(d)
      }
    }
  }
  return out
}

function isRealDate(d: string): boolean {
  const t = Date.parse(`${d}T00:00:00Z`)
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d
}

/** Map cited dates to the patient's records on those dates. Dates with no record are dropped. */
export function extractCitations(text: string, records: Pick<LabRecord, 'id' | 'recordDate'>[]): Citation[] {
  const byDate = new Map<string, string[]>()
  for (const r of records) {
    const d = typeof r.recordDate === 'string' ? r.recordDate.slice(0, 10) : ''
    if (!d) continue
    const list = byDate.get(d) ?? []
    list.push(r.id)
    byDate.set(d, list)
  }
  return extractCitedDates(text)
    .filter((d) => byDate.has(d))
    .map((date) => ({ date, recordIds: byDate.get(date)! }))
}
