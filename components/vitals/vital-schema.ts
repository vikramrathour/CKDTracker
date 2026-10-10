import { z } from 'zod'
import { VITAL_KEYS, VITAL_LIMITS, type VitalKey } from '@/lib/calculations/vitals'

/** Blank → null; otherwise a number within VITAL_LIMITS[key]. */
function measurement(key: VitalKey) {
  const { min, max, unit, label } = VITAL_LIMITS[key]
  return z
    .string()
    .trim()
    .refine((s) => s === '' || Number.isFinite(Number(s)), 'Enter a number')
    .transform((s) => (s === '' ? null : Number(s)))
    .refine((n) => n == null || (n >= min && n <= max), `${label} should be ${min}–${max}${unit ? ` ${unit}` : ''}`)
}

/** `datetime-local` value (YYYY-MM-DDTHH:mm, local time) for a Date. */
export function toLocalInput(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Allow a little clock skew before calling a time "in the future". */
const FUTURE_SLACK_MS = 5 * 60 * 1000

export const vitalFormSchema = z
  .object({
    systolic: measurement('systolic'),
    diastolic: measurement('diastolic'),
    pulse: measurement('pulse'),
    weightKg: measurement('weightKg'),
    temperatureC: measurement('temperatureC'),
    glucose: measurement('glucose'),
    urineOutputMl: measurement('urineOutputMl'),
    notes: z.string().trim().max(500, 'Keep it under 500 characters'),
    recordedAt: z
      .string()
      .refine((s) => s !== '' && !isNaN(new Date(s).getTime()), 'Pick a date and time')
      .refine((s) => new Date(s).getTime() <= Date.now() + FUTURE_SLACK_MS, 'Time can’t be in the future'),
  })
  .superRefine((v, ctx) => {
    if (!VITAL_KEYS.some((k) => v[k] != null)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['root'], message: 'Enter at least one reading' })
    }
    if ((v.systolic == null) !== (v.diastolic == null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [v.systolic == null ? 'systolic' : 'diastolic'],
        message: 'Enter both BP numbers',
      })
    } else if (v.systolic != null && v.diastolic != null && v.diastolic >= v.systolic) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['diastolic'], message: 'Lower number should be below the upper one' })
    }
  })

export type VitalFormInput = z.input<typeof vitalFormSchema>
export type VitalFormValues = z.output<typeof vitalFormSchema>

export function emptyVitalForm(now: Date = new Date()): VitalFormInput {
  return {
    systolic: '',
    diastolic: '',
    pulse: '',
    weightKg: '',
    temperatureC: '',
    glucose: '',
    urineOutputMl: '',
    notes: '',
    recordedAt: toLocalInput(now),
  }
}
