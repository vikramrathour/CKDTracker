export type Panel = 'hemogram' | 'kidney' | 'tacrolimus' | 'electrolytes' | 'lipid' | 'urine'

export interface LabValue {
  testName: string
  panel: Panel
  value: number
  unit: string
  referenceMin?: number
  referenceMax?: number
  isAbnormal: boolean
}

export interface LabRecord {
  id: string
  recordDate: string // ISO date string
  labName: string
  doctorName?: string
  notes?: string
  pdfPath?: string | null
  values: LabValue[]
  /** uid of the member who added it (absent on pre-migration records). */
  createdBy?: string
  createdAt?: string
  updatedAt?: string
}
