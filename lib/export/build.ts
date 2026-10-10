import type { LabRecord } from '@/lib/types/lab-record'
import { formatRange, hasTargetBounds, type TargetLike } from '@/lib/calculations/targets'

/**
 * Export builders (pure). Used by GET /api/export and by the tests.
 */

/**
 * RFC 4180 field escaping. Fields that a spreadsheet would run as a formula
 * (leading = + - @ tab CR) are prefixed with a single quote, except plain
 * numbers such as "-1.5" (CSV/formula injection; OWASP).
 */
export function csvField(value: unknown): string {
  if (value == null) return ''
  let s = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : String(value)
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)) s = `'${s}`
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

export function csvRow(fields: unknown[]): string {
  return fields.map(csvField).join(',')
}

export const LAB_CSV_HEADER = ['date', 'lab', 'test', 'value', 'unit', 'refMin', 'refMax', 'abnormal', 'target'] as const

/** A field that should be a string, whatever was stored (never throws). */
const text = (v: unknown): string => String(v ?? '')

/**
 * One row per lab value, oldest record first. CRLF line endings, header first.
 * refMin/refMax/abnormal are the lab's printed range and flag; `target` is the
 * patient's own target for that test ("5–8", "≥ 45"), blank when none is set.
 */
export function buildLabCsv(records: LabRecord[], targets: readonly (TargetLike & { testName: string })[] = []): string {
  const targetText = new Map<string, string>()
  for (const t of targets) if (t && hasTargetBounds(t)) targetText.set(t.testName, formatRange(t))
  const rows: string[] = [csvRow([...LAB_CSV_HEADER])]
  const sorted = [...records].sort((a, b) => text(a.recordDate).localeCompare(text(b.recordDate)))
  for (const r of sorted) {
    const date = text(r.recordDate).slice(0, 10)
    for (const v of Array.isArray(r.values) ? r.values : []) {
      if (!v || typeof v !== 'object') continue
      rows.push(
        csvRow([
          date,
          r.labName ?? '',
          v.testName,
          v.value,
          v.unit ?? '',
          v.referenceMin ?? '',
          v.referenceMax ?? '',
          v.isAbnormal ? 'yes' : 'no',
          targetText.get(v.testName) ?? '',
        ])
      )
    }
  }
  return rows.join('\r\n') + '\r\n'
}

export interface FullExportInput {
  patient: object | null
  records: LabRecord[]
  /** Each medication with its `doseHistory` array. */
  medications: object[]
  visits: object[]
  questions: object[]
  targets: object[]
  vitals: object[]
  documents: object[]
}

export const EXPORT_SCHEMA_VERSION = 1

/** Full-data JSON export (document metadata only; no file bytes). */
export function buildFullExport(input: FullExportInput, exportedAt: Date = new Date()) {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: exportedAt.toISOString(),
    patient: input.patient,
    labRecords: [...input.records].sort((a, b) => text(a.recordDate).localeCompare(text(b.recordDate))),
    medications: input.medications,
    visits: input.visits,
    questions: input.questions,
    targets: input.targets,
    vitals: input.vitals,
    documents: input.documents,
  }
}

/** Filename-safe slug for downloads ("Asha K." → "asha-k"). */
export function exportSlug(name: string | null | undefined): string {
  const slug = (String(name ?? '') || 'patient').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug.slice(0, 40) || 'patient'
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** A stored date used in a file name: 'YYYY-MM-DD' only, else 'undated'. */
export function fileDate(value: unknown): string {
  return typeof value === 'string' && YMD.test(value) ? value : 'undated'
}

/**
 * Content-Disposition for a download. The plain `filename` is restricted to
 * safe ASCII (no quotes, CR/LF or separators: no header injection); when the
 * name had anything else, the RFC 5987 `filename*` carries the UTF-8 form.
 */
export function contentDisposition(fileName: string): string {
  // eslint-disable-next-line no-control-regex
  const name = String(fileName ?? '').replace(/[\u0000-\u001f\u007f]/g, '')
  const ascii = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 150) || 'download'
  if (ascii === name) return `attachment; filename="${ascii}"`
  const encoded = encodeURIComponent(name.slice(0, 150)).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}
