'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { FormField, fieldA11y } from '@/components/medications/form-field'
import { zodResolver } from '@/lib/hooks/zod-resolver'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import { formatRange } from '@/lib/calculations/targets'
import type { Target } from '@/lib/types/care'
import { targetFormSchema, type TargetFormInput, type TargetFormValues } from './target-schema'

const str = (n: number | null | undefined) => (n == null ? '' : String(n))

/** Set / edit / remove one test's target. Rendered inside a Modal. */
export function TargetEditor({
  testName,
  target,
  onSave,
  onRemove,
  onCancel,
}: {
  testName: string
  target: Target | null
  onSave: (values: TargetFormValues) => Promise<void>
  onRemove?: () => Promise<void>
  onCancel: () => void
}) {
  const ref = REFERENCE_RANGES[testName]
  const [removing, setRemoving] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TargetFormInput, unknown, TargetFormValues>({
    resolver: zodResolver(targetFormSchema),
    defaultValues: {
      min: str(target?.min),
      max: str(target?.max),
      setBy: target?.setBy ?? '',
      notes: target?.notes ?? '',
    },
  })

  const remove = async () => {
    if (!onRemove) return
    setRemoving(true)
    try {
      await onRemove()
    } finally {
      setRemoving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSave)} noValidate className="space-y-4">
      {ref && (
        <p className="text-[13px] text-ink-2">
          Lab reference: <span className="font-semibold tabular">{formatRange(ref)}</span> {ref.unit}. Leave a side blank for
          “at least” or “at most”.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <FormField id="target-min" label={`Minimum${ref?.unit ? ` (${ref.unit})` : ''}`} error={errors.min?.message}>
          <input
            {...register('min')}
            {...fieldA11y('target-min', errors.min?.message)}
            className="field tabular"
            inputMode="decimal"
            placeholder={ref ? String(ref.min) : ''}
          />
        </FormField>
        <FormField id="target-max" label={`Maximum${ref?.unit ? ` (${ref.unit})` : ''}`} error={errors.max?.message}>
          <input
            {...register('max')}
            {...fieldA11y('target-max', errors.max?.message)}
            className="field tabular"
            inputMode="decimal"
            placeholder={ref ? String(ref.max) : ''}
          />
        </FormField>
      </div>
      <FormField id="target-setby" label="Set by" error={errors.setBy?.message}>
        <input {...register('setBy')} {...fieldA11y('target-setby', errors.setBy?.message)} className="field" placeholder="Doctor’s name" />
      </FormField>
      <FormField id="target-notes" label="Notes" error={errors.notes?.message}>
        <textarea
          {...register('notes')}
          {...fieldA11y('target-notes', errors.notes?.message)}
          className="field min-h-[64px]"
          rows={2}
          placeholder="e.g. Lower target after 1 year"
        />
      </FormField>
      <div className="flex flex-wrap gap-2">
        {target && onRemove && (
          <Button variant="danger" onClick={remove} loading={removing} disabled={isSubmitting}>
            Remove
          </Button>
        )}
        <Button variant="ghost" className="flex-1" onClick={onCancel} disabled={isSubmitting || removing}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" loading={isSubmitting} disabled={removing}>
          Save target
        </Button>
      </div>
    </form>
  )
}
