'use client'

import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format } from 'date-fns'
import { Chip } from '@/components/ui/tabs'
import { useThemeColors } from '@/components/ui/status'
import {
  BP_WARNING,
  bpSeries,
  FEVER_C,
  VITAL_LIMITS,
  vitalSeries,
  type VitalKey,
} from '@/lib/calculations/vitals'
import type { Vital } from '@/lib/types/care'

type ChartKey = 'bp' | Exclude<VitalKey, 'systolic' | 'diastolic'>

const CHARTS: { key: ChartKey; label: string }[] = [
  { key: 'bp', label: 'BP' },
  { key: 'weightKg', label: 'Weight' },
  { key: 'pulse', label: 'Pulse' },
  { key: 'temperatureC', label: 'Temp' },
  { key: 'glucose', label: 'Glucose' },
  { key: 'urineOutputMl', label: 'Urine' },
]

/**
 * One vital at a time (chip selector). BP draws systolic and diastolic as
 * two lines on one mmHg axis with the 140/90 thresholds; temperature shows
 * the 38 °C fever line.
 */
export function VitalsChart({ vitals }: { vitals: Vital[] }) {
  const c = useThemeColors()
  const available = CHARTS.filter((ch) =>
    ch.key === 'bp' ? bpSeries(vitals).length > 0 : vitalSeries(vitals, ch.key).length > 0
  )
  const [selected, setSelected] = useState<ChartKey>('bp')
  const active = available.find((a) => a.key === selected) ?? available[0]

  if (!active) return null

  const tick = { fontSize: 10, fill: c.ink3, fontFamily: 'var(--font-sans)' }
  const tooltip = (
    <Tooltip
      cursor={{ stroke: c.hair2 }}
      labelFormatter={(t: unknown) => (typeof t === 'number' ? format(new Date(t), 'dd MMM, HH:mm') : String(t))}
      contentStyle={{
        fontSize: 12,
        fontFamily: 'var(--font-sans)',
        background: c.vellum,
        color: c.ink,
        border: `1px solid ${c.hair2}`,
        borderRadius: 6,
        boxShadow: 'var(--shadow-soft)',
      }}
      labelStyle={{ color: c.ink3, fontWeight: 600 }}
      itemStyle={{ color: c.ink }}
    />
  )
  const xAxis = (
    <XAxis
      dataKey="t"
      type="number"
      scale="time"
      domain={['dataMin', 'dataMax']}
      tick={tick}
      tickFormatter={(t: number) => format(new Date(t), 'dd MMM')}
      axisLine={false}
      tickLine={false}
    />
  )
  const threshold = (y: number, label: string) => (
    <ReferenceLine
      y={y}
      stroke={c.terra}
      strokeOpacity={0.6}
      strokeDasharray="4 3"
      label={{ value: label, position: 'insideTopRight', fontSize: 9, fill: c.ink3 }}
      ifOverflow="extendDomain"
    />
  )
  const dot = (color: string) => ({ r: 4, fill: color, stroke: c.vellum, strokeWidth: 2 })

  let chart: React.ReactNode
  let single = false
  if (active.key === 'bp') {
    const data = bpSeries(vitals).map((p) => ({ t: new Date(p.date).getTime(), systolic: p.systolic, diastolic: p.diastolic }))
    single = data.length < 2
    chart = (
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid stroke={c.hair} vertical={false} />
        {xAxis}
        <YAxis tick={tick} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
        {threshold(BP_WARNING.systolic, '140')}
        {threshold(BP_WARNING.diastolic, '90')}
        {tooltip}
        <Line type="monotone" dataKey="systolic" name="Systolic" stroke={c.ink} strokeWidth={2} dot={dot(c.ink)} connectNulls isAnimationActive={false} />
        <Line type="monotone" dataKey="diastolic" name="Diastolic" stroke={c.sage} strokeWidth={2} dot={dot(c.sage)} connectNulls isAnimationActive={false} />
      </LineChart>
    )
  } else {
    const key = active.key
    const lim = VITAL_LIMITS[key]
    const data = vitalSeries(vitals, key).map((p) => ({ t: new Date(p.date).getTime(), value: p.value }))
    single = data.length < 2
    chart = (
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid stroke={c.hair} vertical={false} />
        {xAxis}
        <YAxis tick={tick} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
        {key === 'temperatureC' && threshold(FEVER_C, `${FEVER_C} °C`)}
        {tooltip}
        <Line
          type="monotone"
          dataKey="value"
          name={`${lim.label} (${lim.unit})`}
          stroke={c.ink}
          strokeWidth={2}
          dot={dot(c.ink)}
          isAnimationActive={false}
        />
      </LineChart>
    )
  }

  return (
    <section className="rounded-card border border-hair bg-vellum p-4">
      <div className="mb-3 flex gap-2 overflow-x-auto scrollbar-hide" role="group" aria-label="Choose a vital">
        {available.map((a) => (
          <Chip key={a.key} selected={a.key === active.key} onClick={() => setSelected(a.key)}>
            {a.label}
          </Chip>
        ))}
      </div>
      {active.key === 'bp' && (
        <div className="mb-1 flex gap-4 text-[11px] text-ink-2">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 rounded-full bg-ink" /> Systolic
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 rounded-full bg-sage" /> Diastolic
          </span>
        </div>
      )}
      <div className="h-44 w-full">
        <ResponsiveContainer>{chart as React.ReactElement}</ResponsiveContainer>
      </div>
      {single && <p className="mt-1 text-[12px] text-ink-3">Add another reading to see a trend.</p>}
    </section>
  )
}
