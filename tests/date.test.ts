import { describe, expect, it } from 'vitest'
import { extractReportDate, parseDateString, toIsoDate } from '@/lib/parsing/date'
import { formatYmd, humanizeYmdDates } from '@/lib/utils'

describe('toIsoDate', () => {
  it('formats a valid date with zero padding', () => {
    expect(toIsoDate(2024, 9, 1)).toBe('2024-09-01')
    expect(toIsoDate(2024, 12, 31)).toBe('2024-12-31')
  })

  it('accepts 29 Feb in leap years only', () => {
    expect(toIsoDate(2024, 2, 29)).toBe('2024-02-29')
    expect(toIsoDate(2000, 2, 29)).toBe('2000-02-29')
    expect(toIsoDate(2023, 2, 29)).toBeNull()
    expect(toIsoDate(1900, 2, 29)).toBeNull()
  })

  it('rejects impossible days and months', () => {
    expect(toIsoDate(2024, 2, 30)).toBeNull()
    expect(toIsoDate(2024, 4, 31)).toBeNull()
    expect(toIsoDate(2024, 13, 1)).toBeNull()
    expect(toIsoDate(2024, 0, 1)).toBeNull()
    expect(toIsoDate(2024, 1, 0)).toBeNull()
  })

  it('rejects out-of-range years and non-integers', () => {
    expect(toIsoDate(1899, 1, 1)).toBeNull()
    expect(toIsoDate(2101, 1, 1)).toBeNull()
    expect(toIsoDate(2024, 1.5, 1)).toBeNull()
    expect(toIsoDate(NaN, 1, 1)).toBeNull()
  })
})

describe('parseDateString', () => {
  it('reads DD/MM/YYYY as day-first even when day <= 12', () => {
    expect(parseDateString('11/09/2024')).toBe('2024-09-11')
    expect(parseDateString('01/02/2025')).toBe('2025-02-01')
    expect(parseDateString('12/01/2024')).toBe('2024-01-12')
  })

  it('accepts -, . and / separators and single-digit parts', () => {
    expect(parseDateString('11-09-2024')).toBe('2024-09-11')
    expect(parseDateString('11.09.2024')).toBe('2024-09-11')
    expect(parseDateString('1/9/2024')).toBe('2024-09-01')
  })

  it('expands 2-digit years to 20xx', () => {
    expect(parseDateString('11/09/24')).toBe('2024-09-11')
    expect(parseDateString('03-02-05')).toBe('2005-02-03')
  })

  it('parses DD-Mon-YYYY, including full names and "Sept"', () => {
    expect(parseDateString('03-Feb-2025')).toBe('2025-02-03')
    expect(parseDateString('03-Feb-25')).toBe('2025-02-03')
    expect(parseDateString('3 February 2025')).toBe('2025-02-03')
    expect(parseDateString('11-Sept-2024')).toBe('2024-09-11')
    expect(parseDateString('11 Sep 2024')).toBe('2024-09-11')
    expect(parseDateString('11-SEP-2024')).toBe('2024-09-11')
    expect(parseDateString('11 Sept, 2024')).toBe('2024-09-11')
    expect(parseDateString('5 Dec. 2024')).toBe('2024-12-05')
  })

  it('parses ISO YYYY-MM-DD without reading it as D-M-Y', () => {
    expect(parseDateString('2024-09-11')).toBe('2024-09-11')
    expect(parseDateString('2024-12-01')).toBe('2024-12-01')
  })

  it('tolerates surrounding whitespace and trailing time', () => {
    expect(parseDateString('  11/09/2024 10:42  ')).toBe('2024-09-11')
    expect(parseDateString('2024-09-11T10:42:00Z')).toBe('2024-09-11')
  })

  it('returns null for impossible dates', () => {
    expect(parseDateString('31/02/2024')).toBeNull()
    expect(parseDateString('29/02/2023')).toBeNull()
    expect(parseDateString('10/13/2024')).toBeNull() // month 13 (would be valid US MM/DD)
    expect(parseDateString('00/01/2024')).toBeNull()
    expect(parseDateString('2024-13-01')).toBeNull()
    expect(parseDateString('2024-02-30')).toBeNull()
    expect(parseDateString('30-Feb-2024')).toBeNull()
  })

  it('accepts 29/02 in a leap year', () => {
    expect(parseDateString('29/02/2024')).toBe('2024-02-29')
  })

  it('returns null for non-dates', () => {
    expect(parseDateString('')).toBeNull()
    expect(parseDateString('hello')).toBeNull()
    expect(parseDateString('14.1 g/dL')).toBeNull()
    expect(parseDateString('11/09/20245')).toBeNull()
    expect(parseDateString('03-Foo-2025')).toBeNull()
  })

  it('never shifts the date by timezone', () => {
    // Result is built from parts, never from new Date(string), so it is
    // identical regardless of process TZ.
    for (const s of ['01/01/2025', '31/12/2024', '2025-01-01', '01-Jan-2025']) {
      const iso = parseDateString(s)
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
    expect(parseDateString('01/01/2025')).toBe('2025-01-01')
    expect(parseDateString('31/12/2024')).toBe('2024-12-31')
    expect(parseDateString('01-Jan-2025')).toBe('2025-01-01')
  })
})

describe('extractReportDate', () => {
  it('reads a labelled collection date day-first', () => {
    expect(extractReportDate('Patient: Test\nCollection Date : 11/09/2024 10:42\n')).toBe('2024-09-11')
  })

  it('handles the documented synthetic examples', () => {
    expect(extractReportDate('Reported On: 03-Feb-25')).toBe('2025-02-03')
    expect(extractReportDate('Sample Date 2024-12-01')).toBe('2024-12-01')
    expect(extractReportDate('Collection Date : 31/02/2024')).toBeNull()
  })

  it('handles label variants', () => {
    expect(extractReportDate('Collected On: 05/06/2024')).toBe('2024-06-05')
    expect(extractReportDate('Collected At - 05/06/2024')).toBe('2024-06-05')
    expect(extractReportDate('Specimen: 05-06-24')).toBe('2024-06-05')
    expect(extractReportDate('Collection Date & Time : 05/06/2024 08:15 AM')).toBe('2024-06-05')
    expect(extractReportDate('Registration Date: 07/06/2024')).toBe('2024-06-07')
    expect(extractReportDate('Registered On: 07/06/2024')).toBe('2024-06-07')
    expect(extractReportDate('Report Date: 08/06/2024')).toBe('2024-06-08')
  })

  it('prefers collection over registration over report regardless of order', () => {
    const text = [
      'Report Date : 20/09/2024',
      'Registration Date : 12/09/2024',
      'Collection Date : 11/09/2024',
    ].join('\n')
    expect(extractReportDate(text)).toBe('2024-09-11')

    const noCollection = ['Report Date : 20/09/2024', 'Registered On : 12/09/2024'].join('\n')
    expect(extractReportDate(noCollection)).toBe('2024-09-12')
  })

  it('prefers a labelled sample date over an earlier unlabelled month-name date', () => {
    const text = 'Printed 01-Jan-2025\nSample Date : 11/09/2024'
    expect(extractReportDate(text)).toBe('2024-09-11')
  })

  it('skips an impossible labelled date and falls through to the next label', () => {
    const text = 'Collection Date : 31/02/2024\nReport Date : 05/03/2024'
    expect(extractReportDate(text)).toBe('2024-03-05')
  })

  it('ignores unlabelled numeric dates', () => {
    expect(extractReportDate('Haemoglobin 14.1 g/dL\nsomething 11/09/2024')).toBeNull()
    expect(extractReportDate('Ref range 10/20/30')).toBeNull()
  })

  it('falls back to an unlabelled month-name or ISO date', () => {
    expect(extractReportDate('Lab report\n11 Sept 2024\nHb 14.1')).toBe('2024-09-11')
    expect(extractReportDate('Lab report generated 2024-09-11')).toBe('2024-09-11')
  })

  it('does not pull an unlabelled month-name date out of a longer number', () => {
    // "123 Jan 2024" — the lookbehind stops "23 Jan 2024" being matched
    expect(extractReportDate('Lot 123 Jan 2024')).toBeNull()
  })

  it('returns null when there is no date', () => {
    expect(extractReportDate('')).toBeNull()
    expect(extractReportDate('Creatinine 1.12 mg/dL 0.70 - 1.30')).toBeNull()
  })

  it('reads a numeric "Reported On" date', () => {
    expect(extractReportDate('Reported On: 11/09/2024')).toBe('2024-09-11')
  })

  it('reads report-label inflections (Report Date, Reporting Date)', () => {
    expect(extractReportDate('Report Date: 11/09/2024')).toBe('2024-09-11')
    expect(extractReportDate('Reporting Date : 11/09/2024 14:05')).toBe('2024-09-11')
  })

  it('does not treat a word merely starting with a label as that label', () => {
    // "Reportable" / "Samples" are not labels
    expect(extractReportDate('Reportable 11/09/2024')).toBeNull()
    expect(extractReportDate('Samples 11/09/2024')).toBeNull()
  })

  it('reads "Sample Collection Date : DD/MM/YYYY"', () => {
    expect(extractReportDate('Sample Collection Date : 11/09/2024')).toBe('2024-09-11')
  })

  it('prefers the collection date over a sample/report date on the same line', () => {
    expect(extractReportDate('Report Date: 20/09/2024  Sample Collection Date : 11/09/2024')).toBe('2024-09-11')
    expect(extractReportDate('Sample Date: 12/09/2024  Collected On: 11/09/2024')).toBe('2024-09-11')
  })

  it('does not read a labelled date from the next line', () => {
    expect(extractReportDate('Collection Date :\n11/09/2024')).toBeNull()
  })

  it('handles CRLF line endings', () => {
    expect(extractReportDate('Patient: Test\r\nCollection Date : 11/09/2024\r\n')).toBe('2024-09-11')
  })
})

describe('activity summary dates', () => {
  it('formats YYYY-MM-DD without a timezone shift', () => {
    expect(formatYmd('2026-08-12')).toBe('12 Aug 2026')
    expect(formatYmd('2026-01-01')).toBe('1 Jan 2026')
    expect(formatYmd('not a date')).toBe('not a date')
    expect(formatYmd('2026-13-01')).toBe('2026-13-01')
  })
  it('rewrites dates inside summaries and leaves other text alone', () => {
    expect(humanizeYmdDates('Added a visit for 2026-08-12')).toBe('Added a visit for 12 Aug 2026')
    expect(humanizeYmdDates('Added Tacrolimus')).toBe('Added Tacrolimus')
  })
})
