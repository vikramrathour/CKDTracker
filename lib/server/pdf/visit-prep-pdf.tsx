import 'server-only'
import React from 'react'
import { Document, Page, StyleSheet, Text, View, renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { formatDelta } from '@/lib/calculations/deltas'
import type { PrepChange, VisitPrepSummary } from '@/lib/visits/prep'

/**
 * A4 visit-prep summary (1–2 pages) rendered with @react-pdf/renderer.
 * Typography: built-in Times (serif headings, the site's Newsreader stand-in)
 * and Helvetica (body); no font files are bundled. The built-in fonts only
 * cover WinAnsi (Latin-1), so all text goes through pdfSafe().
 */

const C = {
  ink: '#121A24',
  ink2: '#4E5866',
  ink3: '#656D7A',
  terra: '#C2633E',
  terraDk: '#9A4522',
  terraPale: '#FBE9E0',
  sage: '#2B5C57',
  recess: '#EDEBE4',
  hair: '#D9DADB',
}

const REPLACEMENTS: Record<string, string> = {
  '→': '->', '←': '<-', '↑': 'up', '↓': 'down', '≥': '>=', '≤': '<=', '⁺': '+', '⁻': '-',
  '−': '-', '×': 'x', ' ': ' ', ' ': ' ', ' ': ' ',
}

/** Map text onto what the standard PDF fonts can draw (WinAnsi). */
export function pdfSafe(input: unknown): string {
  const s = input == null ? '' : String(input)
  let out = ''
  for (const ch of s.normalize('NFC')) {
    if (REPLACEMENTS[ch] != null) out += REPLACEMENTS[ch]
    else if (/[\x20-\x7e\xa0-\xff\n–—‘’“”•…€]/.test(ch)) out += ch
    else out += '?'
  }
  return out
}

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 40, fontFamily: 'Helvetica', fontSize: 9.5, color: C.ink, lineHeight: 1.35 },
  eyebrow: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, letterSpacing: 1.2, color: C.terraDk, textTransform: 'uppercase' },
  title: { fontFamily: 'Times-Roman', fontSize: 24, lineHeight: 1.2, marginTop: 4, marginBottom: 2, color: C.ink },
  titleEm: { fontFamily: 'Times-Italic', color: C.terraDk },
  meta: { marginTop: 4, color: C.ink2, fontSize: 9.5 },
  rule: { borderBottomWidth: 1.5, borderBottomColor: C.terra, marginTop: 10, marginBottom: 4, width: 48 },
  h2: { fontFamily: 'Times-Roman', fontSize: 14, marginTop: 14, marginBottom: 5, color: C.ink },
  h2em: { fontFamily: 'Times-Italic', color: C.terraDk },
  muted: { color: C.ink3 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.hair, paddingVertical: 3.5, alignItems: 'center' },
  head: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.ink, paddingBottom: 3, marginBottom: 1 },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.ink3, letterSpacing: 0.8, textTransform: 'uppercase' },
  bold: { fontFamily: 'Helvetica-Bold' },
  flagged: { backgroundColor: C.terraPale },
  bad: { color: C.terraDk, fontFamily: 'Helvetica-Bold' },
  good: { color: C.sage },
  box: { borderWidth: 0.75, borderColor: C.hair, borderLeftWidth: 2, borderLeftColor: C.terra, padding: 8, marginTop: 4 },
  cols: { flexDirection: 'row', flexWrap: 'wrap' },
  footer: { position: 'absolute', bottom: 22, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: C.ink3 },
})

const COL = { test: '27%', latest: '17%', prev: '17%', change: '13%', trend: '9%', range: '17%' }

function fmtNum(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '-'
  if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString('en-IN')
  return String(Math.round(n * 100) / 100)
}

function fmtDate(ymd: string | null | undefined): string {
  if (!ymd) return '-'
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return ymd
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]
  return `${d} ${mon} ${y}`
}

function rangeText(c: PrepChange): string {
  if (c.rangeMin != null && c.rangeMax != null) return `${fmtNum(c.rangeMin)}-${fmtNum(c.rangeMax)}${c.rangeSource === 'target' ? ' (target)' : ''}`
  if (c.rangeMin != null) return `>= ${fmtNum(c.rangeMin)}`
  if (c.rangeMax != null) return `<= ${fmtNum(c.rangeMax)}`
  return '-'
}

function trendText(c: PrepChange): string {
  if (!c.trend) return '-'
  return c.trend === 'up' ? 'rising' : c.trend === 'down' ? 'falling' : 'steady'
}

function ChangesTable({ rows }: { rows: PrepChange[] }) {
  return (
    <View>
      <View style={s.head} fixed>
        <Text style={[s.th, { width: COL.test }]}>Test</Text>
        <Text style={[s.th, { width: COL.latest }]}>Latest</Text>
        <Text style={[s.th, { width: COL.prev }]}>Before</Text>
        <Text style={[s.th, { width: COL.change }]}>Change</Text>
        <Text style={[s.th, { width: COL.trend }]}>Trend</Text>
        <Text style={[s.th, { width: COL.range }]}>Range</Text>
      </View>
      {rows.map((c) => (
        <View key={c.testName} style={c.outOfRange ? [s.row, s.flagged] : s.row} wrap={false}>
          <Text style={[{ width: COL.test, paddingLeft: 2 }, c.critical ? s.bold : {}]}>{pdfSafe(c.label)}</Text>
          <Text style={{ width: COL.latest }}>
            <Text style={c.outOfRange ? s.bad : s.bold}>{fmtNum(c.latest)}</Text>
            <Text style={s.muted}> {pdfSafe(c.unit)}</Text>
          </Text>
          <Text style={[{ width: COL.prev }, s.muted]}>
            {c.baseline != null ? `${fmtNum(c.baseline)} (${fmtDate(c.baselineDate)})` : '-'}
          </Text>
          <Text style={[{ width: COL.change }, c.delta ? (c.delta.isGood ? s.good : s.bad) : s.muted]}>
            {c.delta ? pdfSafe(formatDelta(c.delta)) : 'new'}
          </Text>
          <Text style={[{ width: COL.trend }, c.trendGood === false ? s.bad : s.muted]}>{trendText(c)}</Text>
          <Text style={[{ width: COL.range }, s.muted]}>{pdfSafe(rangeText(c))}</Text>
        </View>
      ))}
    </View>
  )
}

export interface VisitPrepPdfProps {
  summary: VisitPrepSummary
  patientName: string
  generatedAt?: Date
}

export function VisitPrepPdf({ summary, patientName, generatedAt = new Date() }: VisitPrepPdfProps) {
  const v = summary.visit
  const who = [v.doctorName, v.hospital].filter(Boolean).join(', ')
  const out = summary.outOfRange
  const inRange = summary.changes.filter((c) => !c.outOfRange)

  return (
    <Document title={pdfSafe(`Visit prep - ${patientName} - ${v.visitDate}`)} author="CKD Tracker" creator="CKD Tracker" producer="CKD Tracker">
      <Page size="A4" style={s.page}>
        <Text style={s.eyebrow}>Visit preparation</Text>
        <Text style={s.title}>
          {pdfSafe(patientName)} <Text style={s.titleEm}>· {fmtDate(v.visitDate)}</Text>
        </Text>
        <Text style={s.meta}>
          {pdfSafe([v.visitTime, who, v.purpose].filter(Boolean).join('  ·  ') || 'Doctor visit')}
        </Text>
        <Text style={[s.meta, s.muted]}>
          {summary.previousVisit
            ? `Changes since the previous visit on ${fmtDate(summary.previousVisit.visitDate)}`
            : 'No earlier visit recorded: showing the latest report'}
          {`  ·  ${summary.newRecords.length} new report${summary.newRecords.length === 1 ? '' : 's'}`}
        </Text>
        <View style={s.rule} />

        {summary.alerts.length > 0 && (
          <View>
            <Text style={s.h2}>Alerts</Text>
            {summary.alerts.map((a, i) => (
              <Text key={i} style={a.severity === 'info' ? {} : s.bad}>
                • {pdfSafe(a.title)}
                {a.detail ? <Text style={s.muted}> ({fmtDate(a.detail)})</Text> : null}
              </Text>
            ))}
          </View>
        )}

        {out.length > 0 && (
          <View>
            <Text style={s.h2}>
              Out of <Text style={s.h2em}>range</Text> ({out.length})
            </Text>
            <ChangesTable rows={out} />
          </View>
        )}

        <Text style={s.h2}>
          Changes since <Text style={s.h2em}>last visit</Text>
        </Text>
        {inRange.length > 0 ? (
          <ChangesTable rows={inRange} />
        ) : summary.changes.length === 0 ? (
          <Text style={s.muted}>No lab results in this period.</Text>
        ) : (
          <Text style={s.muted}>Every result in this period is shown above.</Text>
        )}

        {summary.newRecords.length > 0 && (
          <Text style={[s.muted, { marginTop: 6 }]}>
            Reports:{' '}
            {pdfSafe(
              summary.newRecords
                .map((r) => `${fmtDate(r.recordDate)} (${r.labName || 'lab'}, ${r.valueCount} tests${r.abnormalCount ? `, ${r.abnormalCount} flagged` : ''})`)
                .join('; ')
            )}
          </Text>
        )}

        <View wrap={false}>
          <Text style={s.h2}>
            Current <Text style={s.h2em}>medications</Text>
          </Text>
          {summary.medications.length === 0 ? (
            <Text style={s.muted}>None recorded.</Text>
          ) : (
            <View style={s.cols}>
              {summary.medications.map((m) => (
                <Text key={m.id} style={{ width: '50%', paddingVertical: 1.5, paddingRight: 8 }}>
                  <Text style={s.bold}>{pdfSafe(m.name)}</Text> {pdfSafe([m.dose, m.frequency].filter(Boolean).join(', '))}
                </Text>
              ))}
            </View>
          )}
        </View>

        <View wrap={false}>
          <Text style={s.h2}>
            Questions for the <Text style={s.h2em}>doctor</Text>
          </Text>
          {summary.openQuestions.length === 0 ? (
            <Text style={s.muted}>No open questions.</Text>
          ) : (
            summary.openQuestions.map((q, i) => (
              <View key={q.id} style={[s.row, { alignItems: 'flex-start' }]}>
                <Text style={{ width: 18, color: C.terraDk, fontFamily: 'Helvetica-Bold' }}>{i + 1}.</Text>
                <Text style={{ flex: 1 }}>{pdfSafe(q.text)}</Text>
                <Text style={{ width: 70, color: C.ink3, textAlign: 'right' }}>{q.status === 'asked' ? 'asked' : 'answer: ____'}</Text>
              </View>
            ))
          )}
        </View>

        {summary.previousVisit?.advice && (
          <View style={s.box} wrap={false}>
            <Text style={s.eyebrow}>Advice at the last visit ({fmtDate(summary.previousVisit.visitDate)})</Text>
            <Text style={{ marginTop: 3 }}>{pdfSafe(summary.previousVisit.advice)}</Text>
          </View>
        )}

        <View style={s.footer} fixed>
          <Text>
            CKD Tracker · prepared {fmtDate(generatedAt.toISOString().slice(0, 10))} · values as entered; check the original reports
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

export async function renderVisitPrepPdf(props: VisitPrepPdfProps): Promise<Buffer> {
  const el = React.createElement(VisitPrepPdf, props) as unknown as React.ReactElement<DocumentProps>
  return renderToBuffer(el)
}
