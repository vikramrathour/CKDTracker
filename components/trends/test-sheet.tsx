'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import { usePatient } from '@/components/providers/patient-provider'
import { useTargets } from '@/lib/hooks/use-targets'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import { computeDelta, formatDelta } from '@/lib/calculations/deltas'
import { formatRange, resolveRange, valueStatus, type TargetMap } from '@/lib/calculations/targets'
import { OpenReportButton } from '@/components/records/open-report-button'
import { STATUS_STYLES, useThemeColors } from '@/components/ui/status'
import { cn, formatDate, formatShortDate, formatValue } from '@/lib/utils'
import type { LabRecord } from '@/lib/types/lab-record'

/**
 * Tap any test anywhere → bottom sheet with its chart and recent readings.
 * `TestSheetProvider` is mounted once in the app shell; `useTestSheet()` returns
 * null outside it (e.g. public pages), so callers use `sheet?.open(name)`.
 */

interface TestSheetApi {
  open: (testName: string) => void
}

const TestSheetContext = createContext<TestSheetApi | null>(null)

export function useTestSheet(): TestSheetApi | null {
  return useContext(TestSheetContext)
}

export function TestSheetProvider({ children }: { children: React.ReactNode }) {
  const [testName, setTestName] = useState<string | null>(null)
  const open = useCallback((name: string) => setTestName(name), [])
  // Close on navigation so a sheet never lingers over another page.
  const pathname = usePathname()
  useEffect(() => setTestName(null), [pathname])
  const api = useMemo(() => ({ open }), [open])
  return (
    <TestSheetContext.Provider value={api}>
      {children}
      {testName && <TestSheet testName={testName} onClose={() => setTestName(null)} />}
    </TestSheetContext.Provider>
  )
}

function TestSheet({ testName, onClose }: { testName: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const { records } = usePatient()
  const { targetMap } = useTargets()
  const label = REFERENCE_RANGES[testName]?.label ?? testName

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={`${label} history`}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[rgba(12,18,26,.45)] backdrop-blur-[2px]" />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[88vh] max-w-lg overflow-y-auto rounded-t-[14px] border border-hair bg-canvas px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-2 shadow-lift animate-fade-up">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-hair-2" aria-hidden />
        <div className="flex justify-end">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-btn text-ink-3 transition-colors hover:bg-wash hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <TestHistory testName={testName} records={records} targets={targetMap} onNavigate={onClose} />
      </div>
    </div>
  )
}

type Span = '6m' | '1y' | 'all'
const SPANS: { id: Span; label: string; days: number | null }[] = [
  { id: '6m', label: '6 months', days: 183 },
  { id: '1y', label: '1 year', days: 366 },
  { id: 'all', label: 'All', days: null },
]

interface Reading {
  t: number
  date: string
  value: number
  recordId: string
  pdfPath: string | null
  status: 'good' | 'warning' | 'danger'
}

/**
 * Header (latest value, range), a time-window toggle, the chart with the
 * normal band, and the latest readings. Used by the sheet and the Trends page.
 */
export function TestHistory({
  testName,
  records,
  targets,
  onNavigate,
  readingsLimit = 6,
}: {
  testName: string
  records: LabRecord[]
  targets?: TargetMap | null
  /** Called before following a link (the sheet closes itself). */
  onNavigate?: () => void
  readingsLimit?: number
}) {
  const c = useThemeColors()
  const [span, setSpan] = useState<Span>('1y')
  const ref = REFERENCE_RANGES[testName]
  const label = ref?.label ?? testName

  const readings: Reading[] = useMemo(() => {
    const out: Reading[] = []
    for (const r of records) {
      const v = r.values.find((x) => x.testName === testName)
      if (!v || !Number.isFinite(v.value)) continue
      out.push({
        t: new Date(r.recordDate).getTime(),
        date: r.recordDate,
        value: v.value,
        recordId: r.id,
        pdfPath: r.pdfPath ?? null,
        status: valueStatus(testName, v.value, v, targets),
      })
    }
    return out.sort((a, b) => a.t - b.t)
  }, [records, testName, targets])

  const latest = readings[readings.length - 1]
  const latestValue = latest ? records.find((r) => r.id === latest.recordId)?.values.find((x) => x.testName === testName) : undefined
  const unit = latestValue?.unit || ref?.unit || ''
  const range = resolveRange(testName, latestValue ?? null, targets)

  const cutoff = SPANS.find((s) => s.id === span)?.days
  const shown = cutoff && latest ? readings.filter((p) => p.t >= latest.t - cutoff * 86400000) : readings
  // Always show at least the last two readings so a sparse history still draws a line.
  const points = shown.length >= 2 ? shown : readings.slice(-2)

  if (!latest) {
    return <p className="py-8 text-center text-sm text-ink-3">No readings for {label} yet.</p>
  }

  const ls = STATUS_STYLES[latest.status]
  const multiYear = points.length > 1 && new Date(points[0].t).getFullYear() !== new Date(points[points.length - 1].t).getFullYear()
  const tick = { fontSize: 10, fill: c.ink3, fontFamily: 'var(--font-sans)' }
  const hasLow = range?.min != null
  const hasHigh = range?.max != null
  const recent = [...readings].reverse().slice(0, readingsLimit)

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-[1.5rem] font-normal leading-tight tracking-[-.02em] text-ink">{label}</h2>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {range ? (
              <>
                {range.source === 'target' ? 'Your target' : range.source === 'record' ? 'Lab range' : 'Reference'} {formatRange(range)} {unit}
              </>
            ) : (
              unit || ' '
            )}
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className={cn('num text-[30px] leading-none', latest.status === 'good' ? 'text-ink' : 'text-terra-dk')}>
            {formatValue(latest.value, unit)}
          </div>
          <div className="mt-1 text-[11px] text-ink-3">
            {latest.status !== 'good' && <span className="font-semibold text-terra-dk">{ls.label} · </span>}
            {formatDate(latest.date, 'd MMM yyyy')}
          </div>
        </div>
      </div>

      {readings.length > 1 && (
        <>
          <div className="mt-4 flex gap-1 rounded-btn bg-recess p-1" role="tablist" aria-label="Time window">
            {SPANS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={span === s.id}
                onClick={() => setSpan(s.id)}
                className={cn(
                  'min-h-[36px] flex-1 rounded-[3px] text-[13px] font-semibold transition-colors',
                  span === s.id ? 'bg-vellum text-ink shadow-soft' : 'text-ink-3 hover:text-ink'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="mt-3 h-52 w-full">
            <ResponsiveContainer>
              <ComposedChart data={points} margin={{ top: 10, right: 10, bottom: 0, left: -18 }}>
                {(hasLow || hasHigh) && (
                  <ReferenceArea
                    y1={hasLow ? (range!.min as number) : undefined}
                    y2={hasHigh ? (range!.max as number) : undefined}
                    fill={c.sagePale}
                    fillOpacity={0.75}
                    stroke="none"
                    ifOverflow="hidden"
                  />
                )}
                <CartesianGrid stroke={c.hair} vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(t: number) => formatDate(new Date(t).toISOString(), multiYear ? 'MMM yy' : 'd MMM')}
                  tick={tick}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis tick={tick} axisLine={false} tickLine={false} domain={['auto', 'auto']} width={44} />
                <Tooltip
                  cursor={{ stroke: c.hair2 }}
                  contentStyle={{ background: c.vellum, border: `1px solid ${c.hair2}`, borderRadius: 6, fontSize: 12 }}
                  labelFormatter={(t: number) => formatDate(new Date(t).toISOString(), 'd MMM yyyy')}
                  formatter={(v: number) => [`${formatValue(v, unit)} ${unit}`.trim(), label]}
                />
                {/* Straight segments: a smoothed curve would imply values between readings. */}
                <Line
                  type="linear"
                  dataKey="value"
                  stroke={c.ink2}
                  strokeWidth={2}
                  isAnimationActive={false}
                  dot={(props: { cx?: number; cy?: number; payload?: Reading; index?: number }) => {
                    const { cx, cy, payload, index } = props
                    if (cx == null || cy == null || !payload) return <g key={index} />
                    const fill = payload.status === 'good' ? c.sage : c.terra
                    return <circle key={index} cx={cx} cy={cy} r={4} fill={fill} stroke={c.vellum} strokeWidth={1.5} />
                  }}
                  activeDot={{ r: 6 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <h3 className="label mb-1 mt-5 text-ink-3">Recent readings</h3>
      <ul className="divide-y divide-hair border-y border-hair">
        {recent.map((p, i) => {
          const prev = recent[i + 1]
          const d = prev ? computeDelta(testName, p.value, prev.value) : null
          return (
            <li key={p.recordId + p.t} className="flex min-h-[48px] items-center gap-3 py-1.5">
              <Link href={`/records/${p.recordId}`} onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-3">
                <span className="w-[4.5rem] flex-shrink-0 text-[13px] text-ink-2 tabular">{formatShortDate(p.date)}</span>
                <span className={cn('num w-16 flex-shrink-0 text-[17px] tabular', p.status === 'good' ? 'text-ink' : 'text-terra-dk')}>
                  {formatValue(p.value, unit)}
                </span>
                {d && d.direction !== 'stable' ? (
                  <span className={cn('text-[12px] font-semibold tabular', d.isGood ? 'text-sage' : 'text-terra-dk')}>
                    {d.direction === 'up' ? '↑' : '↓'} {formatDelta(d).replace(/^[+-]/, '')}
                  </span>
                ) : (
                  <span className="text-[12px] text-ink-3">{d ? '→' : ''}</span>
                )}
              </Link>
              <OpenReportButton pdfPath={p.pdfPath} variant="icon" label={`Open report from ${formatShortDate(p.date)}`} />
            </li>
          )
        })}
      </ul>
      {/* Only from the sheet: on the Trends page this would link to itself. */}
      {onNavigate && readings.length > readingsLimit && (
        <Link href={`/trends?test=${encodeURIComponent(testName)}`} onClick={onNavigate} className="tlink mt-3 inline-block text-[13px]">
          All {readings.length} readings
        </Link>
      )}
    </div>
  )
}
