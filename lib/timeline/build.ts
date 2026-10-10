import type { LabRecord } from '@/lib/types/lab-record'
import type { DocumentMeta, DoseChange, Question } from '@/lib/types/care'
import type { VisitRecord } from '@/lib/visits/types'

/**
 * Timeline: labs, visits, dose changes, documents and answered questions on
 * one chronological feed (newest first). Pure; the page loads the data.
 */

export type TimelineKind = 'lab' | 'visit' | 'dose' | 'document' | 'question'

export const TIMELINE_KINDS: { id: TimelineKind; label: string }[] = [
  { id: 'lab', label: 'Labs' },
  { id: 'visit', label: 'Visits' },
  { id: 'dose', label: 'Dose changes' },
  { id: 'document', label: 'Documents' },
  { id: 'question', label: 'Answers' },
]

export interface TimelineItem {
  /** Unique across kinds: `${kind}:${id}` */
  key: string
  kind: TimelineKind
  /** YYYY-MM-DD */
  date: string
  /** Sort key within a day (ISO-ish); falls back to the date. */
  sortKey: string
  title: string
  detail?: string
  href?: string
  /** e.g. abnormal lab, upcoming visit */
  flag?: 'abnormal' | 'upcoming'
}

export interface TimelineInput {
  records?: LabRecord[]
  visits?: VisitRecord[]
  doseChanges?: (DoseChange & { medicationName?: string })[]
  documents?: DocumentMeta[]
  questions?: Question[]
  /** YYYY-MM-DD; visits on/after it are flagged upcoming. */
  today?: string
}

const KIND_ORDER: Record<TimelineKind, number> = { visit: 0, lab: 1, dose: 2, question: 3, document: 4 }

const DOC_KIND_LABEL: Record<string, string> = {
  'lab-report': 'Lab report',
  prescription: 'Prescription',
  'discharge-summary': 'Discharge summary',
  imaging: 'Imaging',
  other: 'Document',
}

const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s)

export function buildTimeline(input: TimelineInput): TimelineItem[] {
  const items: TimelineItem[] = []
  const today = input.today

  for (const r of input.records ?? []) {
    if (!isYmd(r.recordDate)) continue
    const abnormal = r.values.filter((v) => v.isAbnormal).length
    items.push({
      key: `lab:${r.id}`,
      kind: 'lab',
      date: r.recordDate.slice(0, 10),
      sortKey: r.recordDate,
      title: `Lab report${r.labName ? ` · ${r.labName}` : ''}`,
      detail: `${r.values.length} test${r.values.length === 1 ? '' : 's'}${abnormal ? `, ${abnormal} out of range` : ''}`,
      href: `/records/${r.id}`,
      flag: abnormal ? 'abnormal' : undefined,
    })
  }

  for (const v of input.visits ?? []) {
    if (!isYmd(v.visitDate)) continue
    const who = [v.doctorName, v.hospital].filter(Boolean).join(', ')
    items.push({
      key: `visit:${v.id}`,
      kind: 'visit',
      date: v.visitDate,
      sortKey: `${v.visitDate}T${v.visitTime || '00:00'}`,
      title: `Visit${who ? ` · ${who}` : ''}`,
      detail: v.purpose || v.advice || undefined,
      href: `/visits/${v.id}`,
      flag: today && v.visitDate >= today ? 'upcoming' : undefined,
    })
  }

  for (const d of input.doseChanges ?? []) {
    if (!isYmd(d.effectiveDate)) continue
    const name = d.medicationName || 'Medication'
    items.push({
      key: `dose:${d.medicationId}/${d.id}`,
      kind: 'dose',
      date: d.effectiveDate,
      sortKey: d.effectiveDate,
      title: `${name} dose ${d.previousDose ? `${d.previousDose} → ${d.dose}` : `set to ${d.dose}`}`,
      detail: d.reason || undefined,
      href: d.visitId ? `/visits/${d.visitId}` : '/medications',
    })
  }

  for (const doc of input.documents ?? []) {
    // A document that produced a lab record is already on the feed as that record.
    if (doc.labRecordId) continue
    const date = isYmd(doc.documentDate) ? doc.documentDate : isYmd(doc.createdAt) ? doc.createdAt : null
    if (!date) continue
    items.push({
      key: `document:${doc.id}`,
      kind: 'document',
      date: date.slice(0, 10),
      sortKey: date,
      title: `${DOC_KIND_LABEL[doc.kind] ?? 'Document'}${doc.title ? ` · ${doc.title}` : ''}`,
      href: `/documents/${doc.id}`,
    })
  }

  for (const q of input.questions ?? []) {
    if (q.status !== 'answered' || !isYmd(q.answeredAt)) continue
    items.push({
      key: `question:${q.id}`,
      kind: 'question',
      date: q.answeredAt.slice(0, 10),
      sortKey: q.answeredAt,
      title: q.text,
      detail: q.answer || undefined,
      href: q.visitId ? `/visits/${q.visitId}` : '/questions',
    })
  }

  return sortTimeline(items)
}

/** Newest first; same instant → visit, lab, dose, question, document. */
export function sortTimeline(items: TimelineItem[]): TimelineItem[] {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    if (a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? 1 : -1
    return KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.key.localeCompare(b.key)
  })
}

export function filterTimeline(items: TimelineItem[], kinds: ReadonlySet<TimelineKind>): TimelineItem[] {
  return kinds.size === 0 ? items : items.filter((i) => kinds.has(i.kind))
}

export interface TimelineMonth {
  /** YYYY-MM */
  month: string
  items: TimelineItem[]
}

/** Group an already-sorted feed into months (order preserved). */
export function groupByMonth(items: TimelineItem[]): TimelineMonth[] {
  const groups: TimelineMonth[] = []
  for (const item of items) {
    const month = item.date.slice(0, 7)
    const last = groups[groups.length - 1]
    if (last && last.month === month) last.items.push(item)
    else groups.push({ month, items: [item] })
  }
  return groups
}
