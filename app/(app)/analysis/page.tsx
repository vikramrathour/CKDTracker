'use client'

import { Header } from '@/components/layout/header'
import { useLabRecords, getTrendPoints } from '@/lib/hooks/use-lab-records'
import { useProfile, ageFromDateOfBirth } from '@/lib/hooks/use-profile'
import { computeAgeGapDeficit, getMedicationInteractions } from '@/lib/calculations/analysis'
import { useMedications } from '@/lib/hooks/use-medications'
import { useTargets } from '@/lib/hooks/use-targets'
import { formatRange, isInRange, resolveRange, type ResolvedRange, type TargetMap } from '@/lib/calculations/targets'
import { linearRegression } from '@/lib/calculations/trends'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import { CardSkeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { LabRecord } from '@/lib/types/lab-record'
import type { Medication } from '@/lib/types/medication'

interface Finding {
  type: 'alert' | 'warning' | 'good' | 'info'
  cat: string
  title: string
  detail: string
  metrics: { l: string; v: string | number; u: string }[]
}

const DAY_MS = 1000 * 60 * 60 * 24

/** Stats over dated points; slope is a date-based regression expressed per 30 days. */
function computeStats(points: { date: string; value: number }[]) {
  if (points.length === 0) return null
  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const avg = values.reduce((s, v) => s + v, 0) / values.length
  let slope: number | null = null
  if (points.length >= 3) {
    const t0 = new Date(points[0].date).getTime()
    const { slope: perDay } = linearRegression(
      points.map((p) => ({ x: (new Date(p.date).getTime() - t0) / DAY_MS, y: p.value }))
    )
    slope = perDay * 30
  }
  return { min, max, avg, count: values.length, slope }
}

/** "your target 5–8" / "the lab range 0.7–1.3" for finding text. */
function rangePhrase(r: ResolvedRange, unit: string): string {
  const who = r.source === 'target' ? `your target${r.target?.setBy ? ` (set by ${r.target.setBy})` : ''}` : r.source === 'record' ? 'the lab range' : 'the reference range'
  return `${who} of ${formatRange(r)}${unit ? ` ${unit}` : ''}`
}

function generateFindings(
  records: LabRecord[],
  medications: Medication[],
  age: number | null,
  targets: TargetMap = {}
): Finding[] {
  if (records.length < 2) return []

  const findings: Finding[] = []
  const latest = records[records.length - 1]

  const getVal = (name: string) => latest.values.find((v) => v.testName === name)?.value
  // Patient target > range printed on the latest report > default (see lib/calculations/targets.ts).
  const rangeFor = (name: string) => resolveRange(name, latest.values.find((v) => v.testName === name), targets)
  const getPoints = (name: string) => getTrendPoints(records, name)

  // --- Creatinine ---
  const cr = getVal('Creatinine')
  const crVals = getPoints('Creatinine')
  const crSt = computeStats(crVals)

  const crRange = rangeFor('Creatinine')
  if (cr != null && crSt && crRange) {
    const crOk = isInRange(cr, crRange)
    const vol = ((crSt.max - crSt.min) / crSt.avg * 100).toFixed(1)
    findings.push({
      type: crOk ? 'good' : 'alert',
      cat: 'Kidney',
      title: `Creatinine: ${cr} mg/dL`,
      detail: `Range over ${crSt.count} readings: ${crSt.min}–${crSt.max} mg/dL (volatility: ${vol}%). Trajectory: ${crSt.slope != null && crSt.slope > 0.01 ? 'gradually rising ↗' : crSt.slope != null && crSt.slope < -0.01 ? 'improving ↘' : 'stable →'}. ${crOk ? `Within ${rangePhrase(crRange, 'mg/dL')}.` : `Outside ${rangePhrase(crRange, 'mg/dL')} — discuss with nephrologist.`}`,
      metrics: [
        { l: 'Current', v: cr, u: 'mg/dL' },
        { l: '18-mo Avg', v: crSt.avg.toFixed(2), u: 'mg/dL' },
        { l: 'Volatility', v: vol + '%', u: '' },
        { l: 'Slope', v: crSt.slope != null && crSt.slope > 0.01 ? '↗ Rising' : crSt.slope != null && crSt.slope < -0.01 ? '↘ Falling' : '→ Stable', u: '' },
      ],
    })
  }

  // --- eGFR ---
  const egfr = getVal('eGFR')
  const egfrVals = getPoints('eGFR')
  const egfrSt = computeStats(egfrVals)

  const egfrRange = rangeFor('eGFR')
  // eGFR is judged on its lower bound only (higher is better) unless a target sets a maximum.
  const egfrFloor = egfrRange?.min ?? 60
  if (egfr != null && egfrSt && egfrSt.count >= 2) {
    const stg = egfr >= 90 ? 'G1' : egfr >= 60 ? 'G2' : egfr >= 45 ? 'G3a' : egfr >= 30 ? 'G3b' : egfr >= 15 ? 'G4' : 'G5'
    // Age-gap only when we know the patient's age (from profile DOB)
    let ageSentence = ''
    let ageMetric: Finding['metrics'] = [{ l: 'Average', v: egfrSt.avg.toFixed(0), u: '' }]
    if (age != null) {
      const deficit = computeAgeGapDeficit(egfr, age)
      const expected = egfr + deficit
      const pct = expected > 0 ? Math.round((deficit / expected) * 100) : 0
      ageSentence = deficit > 0
        ? `Age-expected eGFR is ~${expected}. Your current reading is ${pct}% below that. `
        : `Your current reading is at or above the age-expected ~${expected}. `
      ageMetric = [{ l: 'Age Gap', v: deficit > 0 ? `-${pct}%` : '0%', u: '' }]
    }
    findings.push({
      type: egfr >= egfrFloor ? 'info' : 'alert',
      cat: 'Kidney',
      title: `eGFR: Stage ${stg} — ${egfr} mL/min`,
      detail: `${ageSentence}${egfrRange?.source === 'target' ? `${egfr >= egfrFloor ? 'At or above' : 'Below'} your target of ≥ ${egfrFloor}. ` : ''}Over ${egfrSt.count} readings: lowest ${egfrSt.min}, best ${egfrSt.max}. ${egfrSt.slope != null && egfrSt.slope > 0 ? 'Upward trajectory is encouraging.' : 'Monitor closely.'}`,
      metrics: [
        { l: 'Current', v: egfr, u: 'mL/min' },
        ...ageMetric,
        { l: 'Lowest', v: egfrSt.min, u: '' },
        { l: 'Best', v: egfrSt.max, u: '' },
      ],
    })
  }

  // --- Tacrolimus ---
  const tac = getVal('Tacrolimus')
  const tacVals = getPoints('Tacrolimus')
  const tacSt = computeStats(tacVals)

  if (tac != null && tacSt) {
    const cv = ((tacSt.max - tacSt.min) / tacSt.avg * 100).toFixed(0)
    const tacRange = rangeFor('Tacrolimus') ?? { min: REFERENCE_RANGES['Tacrolimus'].min, max: REFERENCE_RANGES['Tacrolimus'].max, source: 'default' as const }
    findings.push({
      type: isInRange(tac, tacRange) ? 'good' : 'warning',
      cat: 'Immunosuppression',
      title: `Tacrolimus: ${tac} ng/mL`,
      detail: `Range: ${tacSt.min}–${tacSt.max} ng/mL across ${tacSt.count} readings (CV: ${cv}%). ${isInRange(tac, tacRange) ? 'Within' : 'Outside'} ${rangePhrase(tacRange, 'ng/mL')}.${tacRange.source === 'target' ? '' : ' Your doctor may set a different target; add it under Targets.'}`,
      metrics: [
        { l: 'Current', v: tac, u: 'ng/mL' },
        { l: 'CV', v: cv + '%', u: '' },
        { l: 'Trough', v: tacSt.min, u: '' },
        { l: 'Peak', v: tacSt.max, u: '' },
      ],
    })
  }

  // --- Potassium ---
  const k = getVal('Potassium')
  const kVals = getPoints('Potassium')
  const kSt = computeStats(kVals)

  if (k != null && kSt) {
    const kPoints = kVals
    const kMax = rangeFor('Potassium')?.max ?? 5.1
    const kHighNormal = Math.round((kMax - 0.3) * 10) / 10
    const above = kPoints.filter((v) => v.value > kMax).length
    const high = kPoints.filter((v) => v.value >= kHighNormal).length
    findings.push({
      type: k > kMax ? 'alert' : k >= kHighNormal ? 'warning' : 'good',
      cat: 'Electrolytes',
      title: `Potassium: ${k} mEq/L`,
      detail: `Out of ${kSt.count} readings, K⁺ exceeded ${kMax} on ${above} occasion(s) and was ≥${kHighNormal} on ${high}. ${k > kMax ? 'Current level above range — dietary restriction recommended.' : k >= kHighNormal ? 'Trending high-normal.' : 'Current level is comfortably within range.'}`,
      metrics: [
        { l: 'Current', v: k, u: 'mEq/L' },
        { l: `Times >${kMax}`, v: `${above}/${kSt.count}`, u: '' },
        { l: 'Average', v: kSt.avg.toFixed(2), u: '' },
        { l: 'Range', v: `${kSt.min}–${kSt.max}`, u: '' },
      ],
    })
  }

  // --- Hemogram ---
  const hb = getVal('Hemoglobin')
  if (hb != null) {
    const mcv = getVal('MCV')
    const mch = getVal('MCH')
    if (mcv != null && mcv < 82) {
      findings.push({
        type: 'warning',
        cat: 'Hemogram',
        title: 'Microcytic pattern persists',
        detail: `MCV <82, MCH <27 with Hb at ${hb} g/dL. Suggests iron deficiency or thalassemia trait. Iron studies would help differentiate. Hb remains adequate.`,
        metrics: [
          { l: 'MCV', v: mcv ?? '—', u: 'fL' },
          { l: 'MCH', v: mch ?? '—', u: 'pg' },
          { l: 'Hb', v: hb, u: 'g/dL' },
          { l: 'Status', v: 'Adequate', u: '' },
        ],
      })
    }
  }

  // --- Lipids ---
  const hdl = getVal('HDL Cholesterol')
  const ldl = getVal('LDL Cholesterol')
  const tg = getVal('Triglycerides')
  if (hdl != null) {
    findings.push({
      type: hdl < 40 ? 'alert' : 'good',
      cat: 'Lipids',
      title: 'Cardiovascular lipid profile',
      detail: `HDL ${hdl} mg/dL ${hdl < 40 ? '(below protective threshold of 40)' : '(adequate)'}. LDL ${ldl ?? '—'} ${ldl != null && ldl <= 100 ? '(optimal)' : '(borderline)'}. TG ${tg ?? '—'} ${tg != null && tg <= 150 ? '(normal)' : '(borderline high)'}.`,
      metrics: [
        { l: 'HDL', v: hdl, u: 'mg/dL' },
        { l: 'LDL', v: ldl ?? '—', u: 'mg/dL' },
        { l: 'TG', v: tg ?? '—', u: 'mg/dL' },
        { l: 'Status', v: hdl >= 40 ? 'OK' : 'Low', u: '' },
      ],
    })
  }

  // --- Urine ---
  const uprot = latest.values.find((v) => v.testName === 'Urine Protein')
  if (uprot != null) {
    findings.push({
      type: uprot.value === 0 ? 'good' : 'alert',
      cat: 'Urine',
      title: `Protein ${uprot.value === 0 ? 'Absent' : 'Detected'}`,
      detail: `${uprot.value === 0 ? 'No proteinuria — graft filtering well.' : 'Protein detected — may indicate graft stress.'}`,
      metrics: [
        { l: 'Protein', v: uprot.value === 0 ? 'Absent' : 'Present', u: '' },
        { l: 'Sp.Grav', v: getVal('Specific Gravity') ?? '—', u: '' },
        { l: 'pH', v: getVal('Urine pH') ?? '—', u: '' },
      ],
    })
  }

  // --- Drug-Lab Interactions (from the user's own active medications) ---
  const interactions = getMedicationInteractions(medications, latest.values)
  if (interactions.length > 0) {
    findings.push({
      type: interactions.some((i) => i.severity === 'high') ? 'warning' : 'info',
      cat: 'Drug-Lab Interactions',
      title: 'Medication effects on lab values',
      detail: interactions.map((i) => `${i.medication} → ${i.affectedTest}: ${i.effect}.`).join(' '),
      metrics: interactions.slice(0, 4).map((i) => ({ l: `${i.medication} → ${i.affectedTest}`, v: i.severity, u: '' })),
    })
  }

  return findings
}

const CKD_BAR = [
  { l: 'G1', r: '≥90', check: (v: number) => v >= 90 },
  { l: 'G2', r: '60–89', check: (v: number) => v >= 60 && v < 90 },
  { l: 'G3a', r: '45–59', check: (v: number) => v >= 45 && v < 60 },
  { l: 'G3b', r: '30–44', check: (v: number) => v >= 30 && v < 45 },
  { l: 'G4', r: '15–29', check: (v: number) => v >= 15 && v < 30 },
  { l: 'G5', r: '<15', check: (v: number) => v < 15 },
]

// alert → deep red (sparingly), warning → terra, good → sage, info → neutral ink
const TYPE_COLORS = {
  alert: { bg: 'bg-critical-pale', text: 'text-critical', dot: 'bg-critical', edge: 'border-l-critical' },
  warning: { bg: 'bg-terra-pale', text: 'text-terra-dk', dot: 'bg-terra', edge: 'border-l-terra' },
  good: { bg: 'bg-sage-pale', text: 'text-sage', dot: 'bg-sage', edge: 'border-l-sage' },
  info: { bg: 'bg-recess', text: 'text-ink-2', dot: 'bg-ink-3', edge: 'border-l-hair-2' },
}

export default function AnalysisPage() {
  const { records, loading } = useLabRecords()
  const { profile } = useProfile()
  const { medications } = useMedications()
  const { targetMap, loading: targetsLoading } = useTargets()

  if (loading || targetsLoading) {
    return (
      <>
        <Header title="Deep Analysis" emphasis="Deep" />
        <main className="px-4 py-4 space-y-4">
          {[1, 2, 3].map((i) => <CardSkeleton key={i} />)}
        </main>
      </>
    )
  }

  if (records.length < 2) {
    return (
      <>
        <Header title="Deep Analysis" emphasis="Deep" />
        <main className="px-4 pt-20 text-center">
          <p className="text-[15px] text-ink-2">Need at least 2 records for analysis.</p>
        </main>
      </>
    )
  }

  const latest = records[records.length - 1]
  const egfr = latest.values.find((v) => v.testName === 'eGFR')?.value
  const findings = generateFindings(records, medications, ageFromDateOfBirth(profile?.dateOfBirth), targetMap)

  return (
    <>
      <Header title="Deep Analysis" emphasis="Deep" />
      <main className="px-4 py-4">
        <p className="mb-4 text-[13px] text-ink-3 tabular">
          Quantitative assessment across {records.length} data points
        </p>

        {/* CKD Classification */}
        {egfr != null && (
          <section className="mb-3.5 rounded-card border border-hair bg-vellum p-4">
            <h2 className="label mb-3 text-ink-3">
              CKD Classification
            </h2>
            <div className="flex gap-1">
              {CKD_BAR.map((s) => {
                const current = s.check(egfr)
                return (
                  <div
                    key={s.l}
                    aria-current={current ? 'true' : undefined}
                    className={cn(
                      'relative flex-1 rounded-btn py-2 text-center',
                      current ? 'bg-ink text-canvas' : 'bg-recess text-ink-3'
                    )}
                  >
                    {current && <span aria-hidden className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-terra" />}
                    <div className="num text-[15px] font-medium leading-tight">{s.l}</div>
                    <div className="text-[9px] tabular">{s.r}</div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Findings */}
        {findings.map((f, i) => {
          const colors = TYPE_COLORS[f.type]
          return (
            <article key={i} className={cn('mb-3 rounded-card border border-l-2 border-hair bg-vellum p-4', colors.edge)}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className={cn('h-1.5 w-1.5 flex-shrink-0 rounded-full', colors.dot)} aria-hidden />
                <span className={cn('label', colors.text)}>
                  {f.cat}
                </span>
              </div>
              <h3 className="mb-3 font-serif text-lg font-medium leading-snug tracking-[-.015em] text-ink">{f.title}</h3>

              {/* Metrics grid */}
              <div className={cn('mb-3 grid grid-cols-4 gap-1.5 rounded-btn p-2.5', colors.bg)}>
                {f.metrics.map((m, j) => (
                  <div key={j} className="min-w-0 text-center">
                    <div className="mb-0.5 truncate text-[9px] font-bold uppercase tracking-[.06em] text-ink-3">{m.l}</div>
                    <div className={cn(
                      'break-words text-ink',
                      typeof m.v === 'number' ? 'num text-base font-medium' : 'text-xs font-semibold'
                    )}>
                      {m.v}
                    </div>
                    {m.u && <div className="text-[9px] text-ink-3">{m.u}</div>}
                  </div>
                ))}
              </div>

              <p className="text-[13px] leading-relaxed text-ink-2">{f.detail}</p>
            </article>
          )
        })}

        <div className="mt-4 border-t border-hair-2 pt-4 text-center font-serif text-sm italic leading-relaxed text-ink-2">
          For tracking only. Always discuss results with {profile?.doctorName || 'your transplant team'}.
        </div>
      </main>
    </>
  )
}
