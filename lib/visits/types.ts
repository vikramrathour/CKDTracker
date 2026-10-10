import type { Visit } from '@/lib/types/care'

/**
 * Fields Phase 6b stores on visits beyond the shared `Visit` contract in
 * lib/types/care.ts (kept local so lib/types stays owned by the contract).
 * Firestore rules don't restrict visit fields, so these are plain extras.
 */
export interface VisitExtras {
  /** HH:mm (24h, local) */
  visitTime?: string | null
  /**
   * Free-text dose changes noted at the visit ("Tacrolimus 2 mg → 1.5 mg BD").
   * Structured changes live in medications/{id}/doseHistory and are linked
   * through `doseChangeRefs`.
   */
  doseChanges?: string | null
}

export type VisitRecord = Visit & VisitExtras

/** YYYY-MM-DD for "today" in local time. */
export function todayYmd(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** A visit is upcoming when its date is today or later. */
export function isUpcoming(visit: Pick<Visit, 'visitDate'>, today: string = todayYmd()): boolean {
  return visit.visitDate >= today
}

/** Sort key: date then time. */
export function visitSortKey(v: Pick<VisitRecord, 'visitDate' | 'visitTime'>): string {
  return `${v.visitDate}T${v.visitTime || '00:00'}`
}

/** Upcoming visits soonest first; past visits most recent first. */
export function splitVisits<T extends VisitRecord>(visits: T[], today: string = todayYmd()): { upcoming: T[]; past: T[] } {
  const upcoming = visits.filter((v) => isUpcoming(v, today)).sort((a, b) => visitSortKey(a).localeCompare(visitSortKey(b)))
  const past = visits.filter((v) => !isUpcoming(v, today)).sort((a, b) => visitSortKey(b).localeCompare(visitSortKey(a)))
  return { upcoming, past }
}
