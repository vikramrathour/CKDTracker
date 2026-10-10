import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import { computeAlerts, type Alert } from '@/lib/calculations/alerts'
import type { LabRecord } from '@/lib/types/lab-record'
import type { Medication } from '@/lib/types/medication'
import type { AlertRule, DocumentMeta, DoseChange, Question, Target, Visit } from '@/lib/types/care'

/**
 * Model context for /api/chat, built from plain data (pure, so it is unit
 * tested with a synthetic fixture). The Admin-Firestore loader lives in
 * ./loader.ts. Deliberately compact: one CSV row per lab value, short lists
 * for everything else, and no names (the model only ever sees "the patient").
 */

export interface ChatContextInput {
  /** YYYY-MM-DD (the server's "today", used for ages/intervals). */
  today: string
  patient: { dateOfBirth?: string | null; transplantDate?: string | null }
  records: LabRecord[]
  medications: Medication[]
  doseChanges: DoseChange[]
  visits: Visit[]
  questions: Question[]
  targets: Target[]
  alertRules: AlertRule[]
  documents: Pick<DocumentMeta, 'id' | 'kind' | 'title' | 'documentDate' | 'contentType' | 'createdAt'>[]
}

export const CONTEXT_LIMITS = {
  visits: 3,
  doseChangesPerMed: 3,
  questions: 20,
  documents: 25,
  freeText: 280,
  /** LAB_VALUES keeps the most recent reports within both caps. */
  records: 60,
  values: 1500,
} as const

/**
 * The most recent reports that fit in `maxRecords` reports and `maxValues`
 * values (oldest first, like the input). Older ones stay reachable through
 * compute_trend / get_record, which see every record.
 */
export function recentRecordsForContext(
  records: LabRecord[],
  maxRecords: number = CONTEXT_LIMITS.records,
  maxValues: number = CONTEXT_LIMITS.values
): { records: LabRecord[]; omitted: number } {
  const newestFirst = [...records].sort((a, b) => dateOnly(b.recordDate).localeCompare(dateOnly(a.recordDate)))
  const kept: LabRecord[] = []
  let values = 0
  for (const r of newestFirst) {
    const n = Array.isArray(r.values) ? r.values.length : 0
    if (kept.length >= maxRecords || values + n > maxValues) break
    kept.push(r)
    values += n
  }
  return { records: kept.reverse(), omitted: records.length - kept.length }
}

/** Quote a CSV cell only when needed. */
export function csvCell(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Collapse whitespace and cap length, so free text stays short and single-line. */
export function clip(text: unknown, max: number = CONTEXT_LIMITS.freeText): string {
  if (typeof text !== 'string') return ''
  const s = text.replace(/\s+/g, ' ').trim()
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

function dateOnly(v: unknown): string {
  return typeof v === 'string' ? v.slice(0, 10) : ''
}

function yearsBetween(from: string, to: string): number | null {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null
  return (b - a) / (365.25 * 24 * 3600 * 1000)
}

function rangeText(min: number | null | undefined, max: number | null | undefined): string {
  const lo = typeof min === 'number' ? String(min) : ''
  const hi = typeof max === 'number' ? String(max) : ''
  if (lo && hi) return `${lo}-${hi}`
  if (lo) return `>=${lo}`
  if (hi) return `<=${hi}`
  return ''
}

export function buildLabCsv(records: LabRecord[], targets: Target[]): string {
  const targetBy = new Map(targets.map((t) => [t.testName, t]))
  const rows: string[] = ['recordId,date,test,value,unit,refMin,refMax,target']
  const sorted = [...records].sort((a, b) => dateOnly(a.recordDate).localeCompare(dateOnly(b.recordDate)))
  for (const r of sorted) {
    const date = dateOnly(r.recordDate)
    for (const v of r.values ?? []) {
      if (typeof v.value !== 'number' || !Number.isFinite(v.value)) continue
      const ref = REFERENCE_RANGES[v.testName]
      const refMin = v.referenceMin ?? ref?.min
      const refMax = v.referenceMax ?? ref?.max
      const t = targetBy.get(v.testName)
      rows.push(
        [r.id, date, v.testName, v.value, v.unit || ref?.unit || '', refMin ?? '', refMax ?? '', t ? rangeText(t.min, t.max) : '']
          .map(csvCell)
          .join(',')
      )
    }
  }
  return rows.join('\n')
}

export function formatAlerts(alerts: Alert[]): string {
  if (alerts.length === 0) return '- none'
  return alerts.map((a) => `- [${a.severity}] [${a.date}] ${a.message}`).join('\n')
}

export interface BuiltContext {
  text: string
  alerts: Alert[]
}

export function buildChatContext(input: ChatContextInput): BuiltContext {
  const { today } = input
  const alerts = computeAlerts({
    records: input.records,
    targets: input.targets,
    alertRules: input.alertRules,
    medications: input.medications,
  })

  const out: string[] = []
  out.push(`TODAY: ${today}`)

  // Patient (no names: "the patient").
  const facts: string[] = []
  if (input.patient.dateOfBirth) {
    const age = yearsBetween(input.patient.dateOfBirth, today)
    if (age != null) facts.push(`age ${Math.floor(age)}`)
  }
  if (input.patient.transplantDate) {
    const yrs = yearsBetween(input.patient.transplantDate, today)
    facts.push(`kidney transplant on ${dateOnly(input.patient.transplantDate)}${yrs != null ? ` (${yrs.toFixed(1)} years ago)` : ''}`)
  }
  out.push(`PATIENT: ${facts.length ? facts.join('; ') : 'age and transplant date not recorded'}`)

  out.push('', 'ALERTS (computed by the app from the latest values, most urgent first):', formatAlerts(alerts))

  const targets = input.targets.filter((t) => typeof t.min === 'number' || typeof t.max === 'number')
  out.push('', "TARGETS (patient-specific, set by the transplant team; override the lab's reference range):")
  out.push(
    targets.length
      ? targets.map((t) => `- ${t.testName}: ${rangeText(t.min, t.max)}${t.unit ? ` ${t.unit}` : ''}`).join('\n')
      : '- none set'
  )

  const recordCount = input.records.length
  const recent = recentRecordsForContext(input.records)
  const shown =
    recent.omitted > 0
      ? `${recent.records.length} most recent of ${recordCount} reports; older ones via compute_trend/get_record`
      : `${recordCount} report${recordCount === 1 ? '' : 's'}`
  out.push('', `LAB_VALUES (${shown}; CSV; refMin/refMax = lab reference range):`)
  out.push(recordCount ? buildLabCsv(recent.records, input.targets) : '(no lab reports yet)')

  // Medications + recent dose changes.
  const active = input.medications.filter((m) => m.isActive !== false)
  const changesByMed = new Map<string, DoseChange[]>()
  for (const c of input.doseChanges) {
    const list = changesByMed.get(c.medicationId) ?? []
    list.push(c)
    changesByMed.set(c.medicationId, list)
  }
  out.push('', 'MEDICATIONS (active):')
  if (active.length === 0) out.push('- none recorded')
  for (const m of active) {
    const changes = (changesByMed.get(m.id) ?? [])
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
      .slice(0, CONTEXT_LIMITS.doseChangesPerMed)
      .map((c) => `${c.effectiveDate}: ${c.previousDose ? `${clip(c.previousDose, 40)} -> ` : ''}${clip(c.dose, 40)}${c.reason ? ` (${clip(c.reason, 80)})` : ''}`)
    out.push(
      `- ${clip(m.name, 60)} ${clip(m.dose, 40)}, ${clip(m.frequency, 40)}${m.category ? ` [${m.category}]` : ''}` +
        (changes.length ? `; dose changes: ${changes.join('; ')}` : '')
    )
  }

  const visits = [...input.visits]
    .sort((a, b) => (b.visitDate || '').localeCompare(a.visitDate || ''))
    .slice(0, CONTEXT_LIMITS.visits)
  out.push('', `VISITS (last ${CONTEXT_LIMITS.visits}):`)
  if (visits.length === 0) out.push('- none recorded')
  for (const v of visits) {
    const bits = [
      v.purpose && `purpose: ${clip(v.purpose, 120)}`,
      v.notes && `notes: ${clip(v.notes)}`,
      v.advice && `advice: ${clip(v.advice)}`,
      v.nextVisitDate && `next visit: ${dateOnly(v.nextVisitDate)}`,
    ].filter(Boolean)
    out.push(`- ${dateOnly(v.visitDate)}${bits.length ? `: ${bits.join('; ')}` : ''}`)
  }

  const open = input.questions.filter((q) => q.status === 'open').slice(0, CONTEXT_LIMITS.questions)
  out.push('', 'OPEN_QUESTIONS (for the next appointment):')
  out.push(open.length ? open.map((q) => `- ${clip(q.text, 200)}`).join('\n') : '- none')

  const docs = [...input.documents]
    .sort((a, b) => (b.documentDate || b.createdAt || '').localeCompare(a.documentDate || a.createdAt || ''))
    .slice(0, CONTEXT_LIMITS.documents)
  out.push('', 'DOCUMENTS (originals; read one with get_document(documentId)):')
  out.push(
    docs.length
      ? ['documentId,date,kind,title', ...docs.map((d) => [d.id, dateOnly(d.documentDate || d.createdAt), d.kind, clip(d.title ?? '', 80)].map(csvCell).join(','))].join('\n')
      : '- none'
  )

  return { text: out.join('\n'), alerts }
}
