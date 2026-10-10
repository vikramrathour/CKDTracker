export interface Medication {
  id: string
  name: string
  dose: string
  frequency: string
  category: MedicationCategory
  prescribedBy?: string
  isActive: boolean
  notes?: string
  /** uid of the member who added it (absent on pre-migration records). */
  createdBy?: string
  createdAt?: string
}

export type MedicationCategory =
  | 'Immunosuppressant'
  | 'Corticosteroid'
  | 'Antihypertensive'
  | 'SGLT2 Inhibitor'
  | 'Cholesterol'
  | 'Other'
