/**
 * SYNTHETIC chat fixture (invented values, no real patient). Used by the chat
 * unit tests, the optional live Gemini smoke test and the E2E seed script.
 */
import type { LabRecord, LabValue, Panel } from '@/lib/types/lab-record'
import type { Medication } from '@/lib/types/medication'
import type { AlertRule, DocumentMeta, DoseChange, Question, Target, Visit } from '@/lib/types/care'
import type { ChatContextInput } from '@/lib/server/chat/context'

const v = (testName: string, value: number, unit: string, panel: Panel, referenceMin?: number, referenceMax?: number): LabValue => ({
  testName,
  value,
  unit,
  panel,
  referenceMin,
  referenceMax,
  isAbnormal: referenceMin != null && referenceMax != null ? value < referenceMin || value > referenceMax : false,
})

export const SYN_RECORDS: LabRecord[] = [
  {
    id: 'synA',
    recordDate: '2026-04-02T00:00:00.000Z',
    labName: 'Synthetic Labs',
    values: [v('Creatinine', 1.1, 'mg/dL', 'kidney', 0.7, 1.3), v('eGFR', 74, 'mL/min/1.73m²', 'kidney'), v('Tacrolimus', 6.8, 'ng/mL', 'tacrolimus'), v('Potassium', 4.6, 'mEq/L', 'electrolytes', 3.5, 5.1)],
  },
  {
    id: 'synB',
    recordDate: '2026-06-04T00:00:00.000Z',
    labName: 'Synthetic Labs',
    values: [v('Creatinine', 1.15, 'mg/dL', 'kidney', 0.7, 1.3), v('eGFR', 71, 'mL/min/1.73m²', 'kidney'), v('Tacrolimus', 7.4, 'ng/mL', 'tacrolimus'), v('Potassium', 4.9, 'mEq/L', 'electrolytes', 3.5, 5.1)],
  },
  {
    id: 'synC',
    recordDate: '2026-08-06T00:00:00.000Z',
    labName: 'Synthetic Labs',
    values: [v('Creatinine', 1.12, 'mg/dL', 'kidney', 0.7, 1.3), v('eGFR', 73, 'mL/min/1.73m²', 'kidney'), v('Tacrolimus', 8.9, 'ng/mL', 'tacrolimus'), v('Potassium', 5.3, 'mEq/L', 'electrolytes', 3.5, 5.1), v('Hemoglobin', 12.1, 'g/dL', 'hemogram', 13, 17)],
  },
  {
    id: 'synD',
    recordDate: '2026-09-28T00:00:00.000Z',
    labName: 'Synthetic Labs',
    notes: 'Fasting sample',
    values: [v('Creatinine', 1.42, 'mg/dL', 'kidney', 0.7, 1.3), v('eGFR', 58, 'mL/min/1.73m²', 'kidney'), v('Tacrolimus', 9.6, 'ng/mL', 'tacrolimus'), v('Potassium', 5.8, 'mEq/L', 'electrolytes', 3.5, 5.1), v('Hemoglobin', 12.4, 'g/dL', 'hemogram', 13, 17)],
  },
]

export const SYN_TARGETS: Target[] = [{ testName: 'Tacrolimus', min: 5, max: 8, unit: 'ng/mL', createdBy: 'synUser' }]

export const SYN_MEDS: Medication[] = [
  { id: 'medTac', name: 'Tacrolimus', dose: '2 mg', frequency: 'twice daily', category: 'Immunosuppressant', isActive: true },
  { id: 'medPred', name: 'Prednisolone', dose: '5 mg', frequency: 'once daily', category: 'Corticosteroid', isActive: true },
  { id: 'medOld', name: 'Old antibiotic', dose: '500 mg', frequency: 'once daily', category: 'Other', isActive: false },
]

export const SYN_DOSE_CHANGES: DoseChange[] = [
  { id: 'd1', medicationId: 'medTac', dose: '2 mg', previousDose: '1.5 mg', effectiveDate: '2026-07-01', reason: 'Level low at review', createdBy: 'synUser' },
]

export const SYN_VISITS: Visit[] = [
  { id: 'v1', visitDate: '2026-07-01', purpose: 'Routine review', advice: 'Increase tacrolimus, repeat labs in 4 weeks', nextVisitDate: '2026-10-14', createdBy: 'synUser' },
  { id: 'v0', visitDate: '2026-04-05', purpose: 'Routine review', notes: 'Stable', createdBy: 'synUser' },
]

export const SYN_QUESTIONS: Question[] = [
  { id: 'q1', text: 'Should potassium be rechecked sooner?', status: 'open', createdBy: 'synUser' },
  { id: 'q2', text: 'Old answered question', status: 'answered', createdBy: 'synUser' },
]

export const SYN_RULES: AlertRule[] = [{ id: 'r1', testName: 'Hemoglobin', op: 'below', threshold: 12.5, enabled: true, createdBy: 'synUser' }]

export const SYN_DOCUMENTS: Pick<DocumentMeta, 'id' | 'kind' | 'title' | 'documentDate' | 'contentType' | 'createdAt'>[] = [
  { id: 'doc1', kind: 'lab-report', title: 'Report, Sep', documentDate: '2026-09-28', contentType: 'application/pdf' },
]

export function synContextInput(): ChatContextInput {
  return {
    today: '2026-10-10',
    patient: { dateOfBirth: '1980-01-15', transplantDate: '2019-05-20' },
    records: SYN_RECORDS,
    medications: SYN_MEDS,
    doseChanges: SYN_DOSE_CHANGES,
    visits: SYN_VISITS,
    questions: SYN_QUESTIONS,
    targets: SYN_TARGETS,
    alertRules: SYN_RULES,
    documents: SYN_DOCUMENTS,
  }
}
