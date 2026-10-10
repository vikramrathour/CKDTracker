import { z } from 'zod'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'

/**
 * Add-rule form. Mirrors validAlertRule() in firestore.rules: above/below need
 * a threshold, change-pct a percent in (0, 1000], outside-target none.
 */
export const alertRuleFormSchema = z
  .object({
    testName: z.string().refine((t) => t in REFERENCE_RANGES, 'Choose a test'),
    op: z.enum(['above', 'below', 'change-pct', 'outside-target']),
    threshold: z.string().trim(),
    label: z.string().trim().max(80, 'Keep it under 80 characters'),
  })
  .superRefine((v, ctx) => {
    if (v.op === 'outside-target') return
    const n = Number(v.threshold)
    if (v.threshold === '' || !Number.isFinite(n)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['threshold'], message: 'Enter a number' })
    } else if (v.op === 'change-pct' && (n <= 0 || n > 1000)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['threshold'], message: 'Enter a percent between 1 and 1000' })
    }
  })
  .transform((v) => ({
    testName: v.testName,
    op: v.op,
    threshold: v.op === 'outside-target' ? null : Number(v.threshold),
    label: v.label,
  }))

export type AlertRuleFormInput = z.input<typeof alertRuleFormSchema>
export type AlertRuleFormValues = z.output<typeof alertRuleFormSchema>
