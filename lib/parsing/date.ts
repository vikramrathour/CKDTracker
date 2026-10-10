// Report-date extraction for Indian lab reports (Metropolis etc.).
//
// Numeric dates are DD/MM/YYYY (Indian convention). We never hand numeric
// strings to the Date parser: `new Date('11/09/2024')` is read as US MM/DD
// and silently swaps day and month whenever the day is <= 12.
//
// Synthetic examples:
//   'Collection Date : 11/09/2024 10:42'  -> '2024-09-11'
//   'Reported On: 03-Feb-25'              -> '2025-02-03'
//   'Sample Date 2024-12-01'              -> '2024-12-01'
//   'Collection Date : 31/02/2024'        -> null (impossible date)

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

const MONTH_NAME = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)[a-z]*\\.?'

// Each source is a date body with exactly the capture groups the matching
// builder expects.
const NUMERIC_DMY = '(\\d{1,2})[\\/\\-.](\\d{1,2})[\\/\\-.](\\d{4}|\\d{2})(?!\\d)'
const NAMED_DMY = `(\\d{1,2})[\\s\\/\\-]+${MONTH_NAME}[\\s\\/\\-,]+(\\d{4}|\\d{2})(?!\\d)`
const ISO_YMD = '(\\d{4})-(\\d{2})-(\\d{2})(?!\\d)'

function expandYear(y: string): number {
  const n = parseInt(y, 10)
  return y.length === 2 ? 2000 + n : n
}

function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month = last day of this month (UTC, so no TZ shift)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Validate and format Y-M-D directly; returns null for impossible dates. */
export function toIsoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  if (year < 1900 || year > 2100) return null
  if (month < 1 || month > 12) return null
  if (day < 1 || day > daysInMonth(year, month)) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

type Builder = (m: RegExpMatchArray) => string | null

const fromNumeric: Builder = (m) => toIsoDate(expandYear(m[3]), parseInt(m[2], 10), parseInt(m[1], 10))
const fromNamed: Builder = (m) => {
  const month = MONTHS[m[2].toLowerCase()]
  return month ? toIsoDate(expandYear(m[3]), month, parseInt(m[1], 10)) : null
}
const fromIso: Builder = (m) => toIsoDate(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10))

const FORMATS: { body: string; build: Builder }[] = [
  { body: NUMERIC_DMY, build: fromNumeric },
  { body: NAMED_DMY, build: fromNamed },
  { body: ISO_YMD, build: fromIso },
]

/**
 * Parse a single date string (DD/MM/YYYY, DD-MM-YY, DD-Mon-YYYY, YYYY-MM-DD)
 * to `YYYY-MM-DD`, or null if it is not a valid date.
 */
export function parseDateString(input: string): string | null {
  const s = input.trim()
  // ISO first so '2024-09-11' isn't misread as D-M-Y fragments
  for (const { body, build } of [FORMATS[2], FORMATS[0], FORMATS[1]]) {
    const m = s.match(new RegExp(`^${body}`, 'i'))
    if (m) return build(m)
  }
  return null
}

// Label groups in priority order: the collection date is the clinically
// relevant one; registration/report dates are fallbacks.
const LABEL_GROUPS = [
  '(?:Collection|Collected|Sample|Specimen)',
  '(?:Registration|Registered)',
  '(?:Report|Reported)',
]
const LABEL_SUFFIX = '\\s*(?:Date|On|At)?(?:\\s*(?:&|and)\\s*Time)?\\s*[:\\-]?\\s*([^\\n]{0,40})'

/** All matches of a global regex (tsconfig targets ES5 libs, so no matchAll). */
function allMatches(re: RegExp, text: string): RegExpExecArray[] {
  const out: RegExpExecArray[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push(m)
    if (m[0] === '') re.lastIndex++
  }
  return out
}

/**
 * Find the report date in extracted PDF text. Labelled dates (collection,
 * then registration, then report) win; otherwise the first valid month-name
 * or ISO date anywhere in the text. Bare numeric dates without a label are
 * ignored (too easily confused with other numbers).
 */
export function extractReportDate(text: string): string | null {
  for (const label of LABEL_GROUPS) {
    const re = new RegExp(`\\b${label}${LABEL_SUFFIX}`, 'gi')
    for (const m of allMatches(re, text)) {
      const iso = parseDateString(m[1])
      if (iso) return iso
    }
  }

  for (const { body, build } of [FORMATS[1], FORMATS[2]]) {
    const re = new RegExp(`(?<!\\d)${body}`, 'gi')
    for (const m of allMatches(re, text)) {
      const iso = build(m)
      if (iso) return iso
    }
  }

  return null
}
