import { z } from 'zod'
import { TIMES_OF_DAY } from '@/lib/calculations/medications'
import type { MedicationCategory } from '@/lib/types/medication'

export const MEDICATION_CATEGORIES: [MedicationCategory, ...MedicationCategory[]] = [
  'Immunosuppressant',
  'Corticosteroid',
  'Antihypertensive',
  'SGLT2 Inhibitor',
  'Cholesterol',
  'Other',
]

export const FREQUENCY_SUGGESTIONS = [
  'Once daily',
  'Twice daily (12-hourly)',
  'Three times daily',
  'At night',
  'Alternate days',
  'Once a week',
  'As needed',
]

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const optionalText = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters`)

/** Today in local time, YYYY-MM-DD. */
export function todayISODate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const validDate = (s: string) => s === '' || DATE_RE.test(s)
const notFuture = (s: string) => s === '' || s <= todayISODate()

/** Add / edit form. `changeDate` / `changeReason` only matter when dose or frequency changes. */
export const medicationFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Keep it under 100 characters'),
  dose: z.string().trim().min(1, 'Dose is required, e.g. 1 mg').max(60, 'Keep it under 60 characters'),
  frequency: z.string().trim().min(1, 'Frequency is required, e.g. Twice daily').max(60, 'Keep it under 60 characters'),
  category: z.enum(MEDICATION_CATEGORIES),
  timeOfDay: z.array(z.enum(TIMES_OF_DAY)),
  prescribedBy: optionalText(120),
  notes: optionalText(500),
  startDate: z.string().refine(validDate, 'Use a valid date').refine(notFuture, 'Start date can’t be in the future'),
  changeDate: z.string().refine(validDate, 'Use a valid date'),
  changeReason: optionalText(300),
})

export type MedicationFormInput = z.input<typeof medicationFormSchema>
export type MedicationFormValues = z.output<typeof medicationFormSchema>

export const stopFormSchema = z.object({
  stoppedAt: z.string().regex(DATE_RE, 'Pick the date it was stopped').refine(notFuture, 'Stop date can’t be in the future'),
  reason: optionalText(300),
})

export type StopFormInput = z.input<typeof stopFormSchema>
export type StopFormValues = z.output<typeof stopFormSchema>
