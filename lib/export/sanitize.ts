import type { LabRecord } from '@/lib/types/lab-record'
import type { Medication } from '@/lib/types/medication'
import type { DoseChange, Question } from '@/lib/types/care'
import type { VisitRecord } from '@/lib/visits/types'

/**
 * Defensive coercion for fields client writes could have mistyped (rules now
 * check types, but older docs predate that): a date-ish value → ISO/plain
 * string, anything else → ''. Never throws, so one bad doc can't break the
 * export or the visit-prep PDF for everyone.
 */
export function asDateString(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date(v)
    return isNaN(d.getTime()) ? '' : d.toISOString()
  }
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString()
  return ''
}

export function asText(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : ''
}

/** Normalise loaded docs in place so the pure builders can trust string fields. */
export function sanitizeBundle(b: {
  records: LabRecord[]
  medications: (Medication & { doseHistory?: DoseChange[] })[]
  visits: VisitRecord[]
  questions: Question[]
}): void {
  for (const r of b.records) {
    r.recordDate = asDateString(r.recordDate)
    r.labName = asText(r.labName)
    if (!Array.isArray(r.values)) r.values = []
    r.values = r.values.filter(
      (v) => v && typeof v === 'object' && typeof v.testName === 'string' && typeof v.value === 'number' && Number.isFinite(v.value)
    )
  }
  for (const v of b.visits) {
    v.visitDate = asDateString(v.visitDate).slice(0, 10)
    if (v.nextVisitDate != null) v.nextVisitDate = asDateString(v.nextVisitDate).slice(0, 10) || null
  }
  for (const q of b.questions) {
    q.text = asText(q.text)
    if (q.createdAt != null) q.createdAt = asDateString(q.createdAt)
  }
  for (const m of b.medications) {
    m.name = asText(m.name)
    m.dose = asText(m.dose)
    m.frequency = asText(m.frequency)
    for (const h of m.doseHistory ?? []) h.effectiveDate = asDateString(h.effectiveDate).slice(0, 10)
  }
}
