import { z } from 'zod'
import { validateTargetBounds } from '@/lib/calculations/targets'

/** Blank → null; otherwise a finite number. */
const bound = z
  .string()
  .trim()
  .refine((s) => s === '' || Number.isFinite(Number(s)), 'Enter a number')
  .transform((s) => (s === '' ? null : Number(s)))

export const targetFormSchema = z
  .object({
    min: bound,
    max: bound,
    setBy: z.string().trim().max(120, 'Keep it under 120 characters'),
    notes: z.string().trim().max(500, 'Keep it under 500 characters'),
  })
  .superRefine((v, ctx) => {
    const err = validateTargetBounds(v.min, v.max)
    if (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [v.min != null && v.max != null ? 'max' : 'min'],
        message: err,
      })
    }
  })

export type TargetFormInput = z.input<typeof targetFormSchema>
export type TargetFormValues = z.output<typeof targetFormSchema>
