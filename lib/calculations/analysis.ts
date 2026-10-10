import type { CKDStage, CKDStageInfo, VolatilityMetric, MedicationInteraction } from '@/lib/types/analysis'
import type { LabValue } from '@/lib/types/lab-record'
import type { Medication } from '@/lib/types/medication'
import { CKD_STAGES } from '@/lib/constants/reference-ranges'

/**
 * Determine CKD stage from latest eGFR value.
 */
export function determineCKDStage(latestEGFR: number): CKDStageInfo {
  for (const stage of CKD_STAGES) {
    if (latestEGFR >= stage.minEGFR) {
      return {
        stage: stage.stage,
        label: stage.label,
        eGFRRange: stage.stage === '1' ? '≥90' : `${stage.minEGFR}-${CKD_STAGES[CKD_STAGES.indexOf(stage) - 1]?.minEGFR - 1 || '∞'}`,
        description: stage.description,
      }
    }
  }
  return CKD_STAGES[CKD_STAGES.length - 1] as unknown as CKDStageInfo
}

/**
 * Compute volatility metrics (standard deviation and coefficient of variation).
 */
export function computeVolatility(values: number[]): VolatilityMetric {
  if (values.length < 2) {
    return { standardDeviation: 0, coefficientOfVariation: 0, isStable: true }
  }

  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1)
  const standardDeviation = Math.sqrt(variance)
  const coefficientOfVariation = mean !== 0 ? (standardDeviation / mean) * 100 : 0

  return {
    standardDeviation: Math.round(standardDeviation * 100) / 100,
    coefficientOfVariation: Math.round(coefficientOfVariation * 10) / 10,
    isStable: coefficientOfVariation < 10,
  }
}

/**
 * Count how many times each test has been above its reference range.
 */
export function countTimesAboveRange(allValues: LabValue[][]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const recordValues of allValues) {
    for (const val of recordValues) {
      if (val.isAbnormal && val.referenceMax && val.value > val.referenceMax) {
        counts[val.testName] = (counts[val.testName] || 0) + 1
      }
    }
  }
  return counts
}

/**
 * Compute the expected eGFR for a given age and compare to actual.
 * Normal eGFR decline is ~1 mL/min/year after age 30.
 */
export function computeAgeGapDeficit(actualEGFR: number, age: number): number {
  const expectedEGFR = Math.max(60, 120 - Math.max(0, age - 30) * 1)
  return Math.round(expectedEGFR - actualEGFR)
}

/**
 * Map known medication-lab interactions relevant to transplant patients.
 */
export function getMedicationInteractions(
  medications: Medication[],
  latestValues: LabValue[]
): MedicationInteraction[] {
  const interactions: MedicationInteraction[] = []
  const medNames = medications.filter((m) => m.isActive).map((m) => m.name.toLowerCase())
  const valueMap = Object.fromEntries(latestValues.map((v) => [v.testName, v]))

  if (medNames.includes('tacrolimus')) {
    interactions.push({
      medication: 'Tacrolimus',
      affectedTest: 'Potassium',
      effect: 'Can increase potassium levels (hyperkalemia risk)',
      severity: valueMap['Potassium']?.isAbnormal ? 'high' : 'moderate',
    })
    interactions.push({
      medication: 'Tacrolimus',
      affectedTest: 'Creatinine',
      effect: 'Nephrotoxic — can elevate creatinine',
      severity: valueMap['Creatinine']?.isAbnormal ? 'high' : 'moderate',
    })
  }

  if (medNames.includes('prednisolone')) {
    interactions.push({
      medication: 'Prednisolone',
      affectedTest: 'WBC Count',
      effect: 'May elevate white blood cell count',
      severity: 'low',
    })
  }

  if (medNames.includes('dapagliflozin')) {
    interactions.push({
      medication: 'Dapagliflozin',
      affectedTest: 'eGFR',
      effect: 'Initial dip in eGFR (expected), then renoprotective over time',
      severity: 'low',
    })
  }

  if (medNames.includes('enalapril')) {
    interactions.push({
      medication: 'Enalapril',
      affectedTest: 'Potassium',
      effect: 'ACE inhibitor — can increase potassium',
      severity: valueMap['Potassium']?.isAbnormal ? 'high' : 'moderate',
    })
  }

  return interactions
}
