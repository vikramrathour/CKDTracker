import type { Panel } from '@/lib/types/lab-record'

export interface ReferenceRange {
  min: number
  max: number
  unit: string
  panel: Panel
  label: string
  /** For some tests, higher is better (e.g., eGFR). For others, lower is better (e.g., Creatinine). */
  higherIsBetter?: boolean
  /** Clinical weight for health score computation (1-10) */
  weight: number
}

export const REFERENCE_RANGES: Record<string, ReferenceRange> = {
  // Hemogram
  'Hemoglobin': { min: 13.0, max: 17.0, unit: 'g/dL', panel: 'hemogram', label: 'Hemoglobin', weight: 7 },
  'RBC Count': { min: 4.5, max: 5.5, unit: 'million/µL', panel: 'hemogram', label: 'RBC Count', weight: 4 },
  'WBC Count': { min: 4000, max: 11000, unit: '/µL', panel: 'hemogram', label: 'WBC Count', weight: 5 },
  'Platelet Count': { min: 150000, max: 410000, unit: '/µL', panel: 'hemogram', label: 'Platelet Count', weight: 5 },
  'PCV/Hematocrit': { min: 40, max: 50, unit: '%', panel: 'hemogram', label: 'PCV/Hematocrit', weight: 4 },
  'MCV': { min: 83, max: 101, unit: 'fL', panel: 'hemogram', label: 'MCV', weight: 3 },
  'MCH': { min: 27, max: 32, unit: 'pg', panel: 'hemogram', label: 'MCH', weight: 3 },
  'MCHC': { min: 31.5, max: 34.5, unit: 'g/dL', panel: 'hemogram', label: 'MCHC', weight: 3 },

  // Kidney Function
  'Creatinine': { min: 0.7, max: 1.3, unit: 'mg/dL', panel: 'kidney', label: 'Creatinine', weight: 10 },
  'eGFR': { min: 90, max: 120, unit: 'mL/min/1.73m²', panel: 'kidney', label: 'eGFR', higherIsBetter: true, weight: 10 },
  'BUN': { min: 7, max: 20, unit: 'mg/dL', panel: 'kidney', label: 'Blood Urea Nitrogen', weight: 7 },
  'Urea': { min: 15, max: 43, unit: 'mg/dL', panel: 'kidney', label: 'Urea', weight: 6 },
  'Uric Acid': { min: 3.5, max: 7.2, unit: 'mg/dL', panel: 'kidney', label: 'Uric Acid', weight: 5 },
  'BUN/Creatinine Ratio': { min: 10, max: 20, unit: '', panel: 'kidney', label: 'BUN/Creatinine Ratio', weight: 3 },

  // Tacrolimus
  'Tacrolimus': { min: 5, max: 10, unit: 'ng/mL', panel: 'tacrolimus', label: 'Tacrolimus Trough', weight: 10 },

  // Electrolytes
  'Potassium': { min: 3.5, max: 5.1, unit: 'mEq/L', panel: 'electrolytes', label: 'Potassium (K⁺)', weight: 9 },
  'Sodium': { min: 136, max: 146, unit: 'mEq/L', panel: 'electrolytes', label: 'Sodium (Na⁺)', weight: 7 },
  'Chloride': { min: 98, max: 106, unit: 'mEq/L', panel: 'electrolytes', label: 'Chloride (Cl⁻)', weight: 5 },
  'Calcium': { min: 8.5, max: 10.5, unit: 'mg/dL', panel: 'electrolytes', label: 'Calcium', weight: 6 },
  'Phosphorus': { min: 2.5, max: 4.5, unit: 'mg/dL', panel: 'electrolytes', label: 'Phosphorus', weight: 6 },

  // Fasting Lipid Profile
  'Total Cholesterol': { min: 0, max: 200, unit: 'mg/dL', panel: 'lipid', label: 'Total Cholesterol', weight: 5 },
  'Triglycerides': { min: 0, max: 150, unit: 'mg/dL', panel: 'lipid', label: 'Triglycerides', weight: 5 },
  'HDL Cholesterol': { min: 40, max: 100, unit: 'mg/dL', panel: 'lipid', label: 'HDL Cholesterol', higherIsBetter: true, weight: 5 },
  'LDL Cholesterol': { min: 0, max: 100, unit: 'mg/dL', panel: 'lipid', label: 'LDL Cholesterol', weight: 6 },
  'VLDL Cholesterol': { min: 0, max: 30, unit: 'mg/dL', panel: 'lipid', label: 'VLDL Cholesterol', weight: 3 },

  // Urine Routine
  'Urine pH': { min: 4.5, max: 8.0, unit: '', panel: 'urine', label: 'Urine pH', weight: 2 },
  'Specific Gravity': { min: 1.005, max: 1.030, unit: '', panel: 'urine', label: 'Specific Gravity', weight: 2 },
  'Urine Protein': { min: 0, max: 0, unit: 'mg/dL', panel: 'urine', label: 'Urine Protein', weight: 7 },
}

// CKD Staging by eGFR
export const CKD_STAGES = [
  { stage: '1' as const, minEGFR: 90, label: 'Stage 1', description: 'Normal kidney function', color: '#10b981' },
  { stage: '2' as const, minEGFR: 60, label: 'Stage 2', description: 'Mildly decreased', color: '#84cc16' },
  { stage: '3a' as const, minEGFR: 45, label: 'Stage 3a', description: 'Mild to moderate decrease', color: '#f59e0b' },
  { stage: '3b' as const, minEGFR: 30, label: 'Stage 3b', description: 'Moderate to severe decrease', color: '#f97316' },
  { stage: '4' as const, minEGFR: 15, label: 'Stage 4', description: 'Severely decreased', color: '#ef4444' },
  { stage: '5' as const, minEGFR: 0, label: 'Stage 5', description: 'Kidney failure', color: '#991b1b' },
]
