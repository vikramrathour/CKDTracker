// Synthetic sample data — not a real patient. Used when lib/personal/local.ts is absent.
// To use real data, copy this file to local.ts (gitignored) and edit it.
import type { PersonalData } from './types'

export const PERSONAL_DATA: PersonalData = {
  doctorName: 'Dr. Sample Nephrologist',
  doctorHospital: 'Sample Hospital',
  seedRecords: [
    {
      recordDate: '2025-01-15',
      labName: 'Sample Lab',
      values: [
        { testName: 'Creatinine', panel: 'kidney', value: 1.2, unit: 'mg/dL', referenceMin: 0.7, referenceMax: 1.3, isAbnormal: false },
        { testName: 'eGFR', panel: 'kidney', value: 68, unit: 'mL/min/1.73m²', referenceMin: 60, referenceMax: 120, isAbnormal: false },
        { testName: 'Tacrolimus', panel: 'tacrolimus', value: 6.5, unit: 'ng/mL', referenceMin: 5, referenceMax: 10, isAbnormal: false },
        { testName: 'Potassium', panel: 'electrolytes', value: 4.6, unit: 'mEq/L', referenceMin: 3.5, referenceMax: 5.1, isAbnormal: false },
        { testName: 'Sodium', panel: 'electrolytes', value: 139, unit: 'mEq/L', referenceMin: 136, referenceMax: 146, isAbnormal: false },
        { testName: 'Hemoglobin', panel: 'hemogram', value: 13.4, unit: 'g/dL', referenceMin: 13, referenceMax: 17, isAbnormal: false },
      ],
    },
    {
      recordDate: '2025-04-20',
      labName: 'Sample Lab',
      values: [
        { testName: 'Creatinine', panel: 'kidney', value: 1.35, unit: 'mg/dL', referenceMin: 0.7, referenceMax: 1.3, isAbnormal: true },
        { testName: 'eGFR', panel: 'kidney', value: 62, unit: 'mL/min/1.73m²', referenceMin: 60, referenceMax: 120, isAbnormal: false },
        { testName: 'Tacrolimus', panel: 'tacrolimus', value: 8.1, unit: 'ng/mL', referenceMin: 5, referenceMax: 10, isAbnormal: false },
        { testName: 'Potassium', panel: 'electrolytes', value: 5.3, unit: 'mEq/L', referenceMin: 3.5, referenceMax: 5.1, isAbnormal: true },
        { testName: 'Sodium', panel: 'electrolytes', value: 141, unit: 'mEq/L', referenceMin: 136, referenceMax: 146, isAbnormal: false },
        { testName: 'Hemoglobin', panel: 'hemogram', value: 12.8, unit: 'g/dL', referenceMin: 13, referenceMax: 17, isAbnormal: true },
      ],
    },
    {
      recordDate: '2025-08-10',
      labName: 'Sample Lab',
      values: [
        { testName: 'Creatinine', panel: 'kidney', value: 1.15, unit: 'mg/dL', referenceMin: 0.7, referenceMax: 1.3, isAbnormal: false },
        { testName: 'eGFR', panel: 'kidney', value: 71, unit: 'mL/min/1.73m²', referenceMin: 60, referenceMax: 120, isAbnormal: false },
        { testName: 'Tacrolimus', panel: 'tacrolimus', value: 7.2, unit: 'ng/mL', referenceMin: 5, referenceMax: 10, isAbnormal: false },
        { testName: 'Potassium', panel: 'electrolytes', value: 4.8, unit: 'mEq/L', referenceMin: 3.5, referenceMax: 5.1, isAbnormal: false },
        { testName: 'Sodium', panel: 'electrolytes', value: 138, unit: 'mEq/L', referenceMin: 136, referenceMax: 146, isAbnormal: false },
        { testName: 'Hemoglobin', panel: 'hemogram', value: 13.9, unit: 'g/dL', referenceMin: 13, referenceMax: 17, isAbnormal: false },
        { testName: 'Total Cholesterol', panel: 'lipid', value: 182, unit: 'mg/dL', referenceMin: 0, referenceMax: 200, isAbnormal: false },
        { testName: 'HDL Cholesterol', panel: 'lipid', value: 44, unit: 'mg/dL', referenceMin: 40, referenceMax: 100, isAbnormal: false },
        { testName: 'LDL Cholesterol', panel: 'lipid', value: 108, unit: 'mg/dL', referenceMin: 0, referenceMax: 100, isAbnormal: true },
        { testName: 'Triglycerides', panel: 'lipid', value: 140, unit: 'mg/dL', referenceMin: 0, referenceMax: 150, isAbnormal: false },
      ],
    },
  ],
  medications: [
    { name: 'Tacrolimus', dose: '1 mg', frequency: 'Twice daily (Morning & Evening)', category: 'Immunosuppressant', timeOfDay: ['morning', 'evening'], prescribedBy: 'Dr. Sample Nephrologist' },
    { name: 'Prednisolone', dose: '5 mg', frequency: 'Once daily (Morning)', category: 'Corticosteroid', timeOfDay: ['morning'], prescribedBy: 'Dr. Sample Nephrologist' },
    { name: 'Mycophenolate', dose: '500 mg', frequency: 'Twice daily (Morning & Evening)', category: 'Immunosuppressant', timeOfDay: ['morning', 'evening'], prescribedBy: 'Dr. Sample Nephrologist' },
  ],
}
