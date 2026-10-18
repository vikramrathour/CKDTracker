import type { Panel } from '@/lib/types/lab-record'

export interface PanelDefinition {
  id: Panel
  label: string
  icon: string // lucide-react icon name
  tests: string[]
}

export const PANELS: PanelDefinition[] = [
  {
    id: 'hemogram',
    label: 'Hemogram',
    icon: 'Droplets',
    tests: [
      'Hemoglobin',
      'RBC Count',
      'WBC Count',
      'Platelet Count',
      'PCV/Hematocrit',
      'MCV',
      'MCH',
      'MCHC',
    ],
  },
  {
    id: 'kidney',
    label: 'Kidney Function',
    icon: 'Bean',
    tests: [
      'Creatinine',
      'eGFR',
      'BUN',
      'Urea',
      'Uric Acid',
      'BUN/Creatinine Ratio',
    ],
  },
  {
    id: 'tacrolimus',
    label: 'Tacrolimus',
    icon: 'Pill',
    tests: ['Tacrolimus'],
  },
  {
    id: 'electrolytes',
    label: 'Electrolytes',
    icon: 'Zap',
    tests: [
      'Potassium',
      'Sodium',
      'Chloride',
      'Calcium',
      'Phosphorus',
    ],
  },
  {
    id: 'lipid',
    label: 'Lipid Profile',
    icon: 'Heart',
    tests: [
      'Total Cholesterol',
      'Triglycerides',
      'HDL Cholesterol',
      'LDL Cholesterol',
      'VLDL Cholesterol',
    ],
  },
  {
    id: 'urine',
    label: 'Urine Routine',
    icon: 'TestTube',
    tests: [
      'Urine pH',
      'Specific Gravity',
      'Urine Protein',
    ],
  },
]

export const PANEL_MAP = Object.fromEntries(
  PANELS.map((p) => [p.id, p])
) as Partial<Record<Panel, PanelDefinition>>

/** Flat list of all test names in display order */
export const ALL_TESTS = PANELS.flatMap((p) => p.tests)

/** Critical metrics shown on the dashboard */
export const CRITICAL_METRICS = ['Creatinine', 'eGFR', 'Tacrolimus'] as const
