/** Scores are 0–100, or null when the record has no values for that system. */
export interface HealthScore {
  overall: number | null
  systems: {
    kidney: number | null
    immunosuppression: number | null
    electrolytes: number | null
    hemogram: number | null
    lipid: number | null
  }
}

export interface TrendPoint {
  date: string
  value: number
}

export interface TrendData {
  testName: string
  unit: string
  points: TrendPoint[]
  min: number
  max: number
  avg: number
  slope: number
  rSquared: number
  direction: 'improving' | 'worsening' | 'stable'
}

export type CKDStage = '1' | '2' | '3a' | '3b' | '4' | '5'

export interface CKDStageInfo {
  stage: CKDStage
  label: string
  eGFRRange: string
  description: string
}

export interface DeltaResult {
  absolute: number
  percentage: number
  direction: 'up' | 'down' | 'stable'
  isGood: boolean
}

export interface RegressionResult {
  slope: number
  intercept: number
  rSquared: number
}

export interface VolatilityMetric {
  standardDeviation: number
  coefficientOfVariation: number
  isStable: boolean
}

export interface MedicationInteraction {
  medication: string
  affectedTest: string
  effect: string
  severity: 'low' | 'moderate' | 'high'
}

export interface FindingCard {
  title: string
  description: string
  metrics: {
    label: string
    value: string | number
    unit?: string
    status: 'good' | 'warning' | 'danger' | 'neutral'
  }[]
}
