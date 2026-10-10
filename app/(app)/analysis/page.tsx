'use client'

import { Header } from '@/components/layout/header'
import { useLabRecords, getTrendPoints } from '@/lib/hooks/use-lab-records'
import { useProfile, ageFromDateOfBirth } from '@/lib/hooks/use-profile'
import { computeAgeGapDeficit, getMedicationInteractions } from '@/lib/calculations/analysis'
import { getMedications } from '@/lib/firebase/firestore'
import { useAuth } from '@/components/providers/auth-provider'
import { useEffect, useState } from 'react'
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

function generateFindings(records: LabRecord[], medications: Medication[], age: number | null): Finding[] {
  if (records.length < 2) return []

  const findings: Finding[] = []
  const latest = records[records.length - 1]

  const getVal = (name: string) => latest.values.find((v) => v.testName === name)?.value
  const getPoints = (name: string) => getTrendPoints(records, name)

  // --- Creatinine ---
  const cr = getVal('Creatinine')
  const crVals = getPoints('Creatinine')
  const crSt = computeStats(crVals)

  if (cr != null && crSt) {
    const vol = ((crSt.max - crSt.min) / crSt.avg * 100).toFixed(1)
    findings.push({
      type: cr <= 1.3 ? 'good' : 'alert',
      cat: 'Kidney',
      title: `Creatinine: ${cr} mg/dL`,
      detail: `Range over ${crSt.count} readings: ${crSt.min}–${crSt.max} mg/dL (volatility: ${vol}%). Trajectory: ${crSt.slope != null && crSt.slope > 0.01 ? 'gradually rising ↗' : crSt.slope != null && crSt.slope < -0.01 ? 'improving ↘' : 'stable →'}. ${cr <= 1.3 ? 'Within normal limits.' : 'Above 1.3 — discuss with nephrologist.'}`,
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
      type: egfr >= 60 ? 'info' : 'alert',
      cat: 'Kidney',
      title: `eGFR: Stage ${stg} — ${egfr} mL/min`,
      detail: `${ageSentence}Over ${egfrSt.count} readings: lowest ${egfrSt.min}, best ${egfrSt.max}. ${egfrSt.slope != null && egfrSt.slope > 0 ? 'Upward trajectory is encouraging.' : 'Monitor closely.'}`,
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
    const tacRef = REFERENCE_RANGES['Tacrolimus']
    findings.push({
      type: tac >= tacRef.min && tac <= tacRef.max ? 'good' : 'warning',
      cat: 'Immunosuppression',
      title: `Tacrolimus: ${tac} ng/mL`,
      detail: `Range: ${tacSt.min}–${tacSt.max} ng/mL across ${tacSt.count} readings (CV: ${cv}%). For stable grafts >6 months, <5 may suffice.`,
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
    const above = kPoints.filter((v) => v.value > 5.1).length
    const high = kPoints.filter((v) => v.value >= 4.8).length
    findings.push({
      type: k > 5.1 ? 'alert' : k >= 4.8 ? 'warning' : 'good',
      cat: 'Electrolytes',
      title: `Potassium: ${k} mmol/L`,
      detail: `Out of ${kSt.count} readings, K⁺ exceeded 5.1 on ${above} occasion(s) and was ≥4.8 on ${high}. ${k > 5.1 ? 'Current level above range — dietary restriction recommended.' : 'Trending high-normal.'}`,
      metrics: [
        { l: 'Current', v: k, u: 'mmol/L' },
        { l: 'Times >5.1', v: `${above}/${kSt.count}`, u: '' },
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

const TYPE_COLORS = {
  alert: { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500' },
  warning: { bg: 'bg-amber-50', text: 'text-amber-600', dot: 'bg-amber-500' },
  good: { bg: 'bg-emerald-50', text: 'text-emerald-600', dot: 'bg-emerald-500' },
  info: { bg: 'bg-blue-50', text: 'text-blue-600', dot: 'bg-blue-500' },
}

export default function AnalysisPage() {
  const { records, loading } = useLabRecords()
  const { profile } = useProfile()
  const { user } = useAuth()
  const [medications, setMedications] = useState<Medication[]>([])

  useEffect(() => {
    if (!user) return
    getMedications(user.uid).then(setMedications).catch(() => setMedications([]))
  }, [user])

  if (loading) {
    return (
      <>
        <Header title="Deep Analysis" />
        <main className="px-4 py-4 space-y-4">
          {[1, 2, 3].map((i) => <CardSkeleton key={i} />)}
        </main>
      </>
    )
  }

  if (records.length < 2) {
    return (
      <>
        <Header title="Deep Analysis" />
        <main className="px-4 py-4 text-center pt-20">
          <div className="text-sm text-gray-500">Need at least 2 records for analysis.</div>
        </main>
      </>
    )
  }

  const latest = records[records.length - 1]
  const egfr = latest.values.find((v) => v.testName === 'eGFR')?.value
  const findings = generateFindings(records, medications, ageFromDateOfBirth(profile?.dateOfBirth))

  return (
    <>
      <Header title="Deep Analysis" />
      <main className="px-4 py-4">
        <div className="text-xs text-gray-400 mb-4">
          Quantitative assessment across {records.length} data points
        </div>

        {/* CKD Classification */}
        {egfr != null && (
          <div className="bg-white rounded-xl p-4 border border-gray-100 mb-3.5">
            <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-2.5">
              CKD Classification
            </div>
            <div className="flex gap-1 mb-2">
              {CKD_BAR.map((s) => (
                <div
                  key={s.l}
                  className={cn(
                    'flex-1 py-2 rounded-md text-center',
                    s.check(egfr) ? 'bg-emerald-700 text-white' : 'bg-gray-100 text-gray-400'
                  )}
                >
                  <div className="text-xs font-bold">{s.l}</div>
                  <div className="text-[8px]">{s.r}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Findings */}
        {findings.map((f, i) => {
          const colors = TYPE_COLORS[f.type]
          return (
            <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 mb-3">
              <div className="flex items-center gap-2 mb-2">
                <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', colors.dot)} />
                <span className={cn('text-[11px] uppercase tracking-wider font-semibold', colors.text)}>
                  {f.cat}
                </span>
              </div>
              <div className="text-sm font-semibold text-gray-900 mb-1.5">{f.title}</div>

              {/* Metrics grid */}
              <div className={cn('grid grid-cols-4 gap-1.5 mb-2.5 p-2.5 rounded-lg', colors.bg)}>
                {f.metrics.map((m, j) => (
                  <div key={j} className="text-center">
                    <div className="text-[8px] text-gray-400 uppercase tracking-wider mb-0.5">{m.l}</div>
                    <div className={cn(
                      'text-xs font-bold text-gray-900',
                      typeof m.v === 'number' && 'font-mono'
                    )}>
                      {m.v}
                    </div>
                    {m.u && <div className="text-[8px] text-gray-400">{m.u}</div>}
                  </div>
                ))}
              </div>

              <div className="text-xs text-gray-500 leading-relaxed">{f.detail}</div>
            </div>
          )
        })}

        <div className="mt-2 p-3.5 bg-gray-50 rounded-lg text-[11px] text-gray-400 text-center leading-relaxed">
          For tracking only. Always discuss results with {profile?.doctorName || 'your transplant team'}.
        </div>
      </main>
    </>
  )
}
