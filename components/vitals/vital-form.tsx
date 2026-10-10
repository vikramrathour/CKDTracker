'use client'

import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { FormField, fieldA11y } from '@/components/medications/form-field'
import { usePatient } from '@/components/providers/patient-provider'
import { useToast } from '@/components/providers/toast-provider'
import { zodResolver } from '@/lib/hooks/zod-resolver'
import { addVital } from '@/lib/firebase/vitals'
import { flagsForVital, VITAL_LIMITS, type VitalFlag, type VitalKey } from '@/lib/calculations/vitals'
import type { Vital } from '@/lib/types/care'
import { emptyVitalForm, toLocalInput, vitalFormSchema, type VitalFormInput, type VitalFormValues } from './vital-schema'

/**
 * Fast vitals entry. `variant="quick"` shows BP, pulse, weight and
 * temperature only (dashboard card); "full" adds glucose, urine output,
 * notes and the time. Any subset may be filled. After saving, `onSaved`
 * receives the flags for the new reading (computed against `history`).
 */
export function VitalForm({
  variant = 'full',
  history = [],
  onSaved,
}: {
  variant?: 'full' | 'quick'
  history?: Vital[]
  onSaved?: (flags: VitalFlag[]) => void
}) {
  const { pid } = usePatient()
  const { showToast } = useToast()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<VitalFormInput, unknown, VitalFormValues>({
    resolver: zodResolver(vitalFormSchema),
    defaultValues: emptyVitalForm(),
  })
  const rootError = (errors as { root?: { message?: string } }).root?.message

  const onSubmit = async (v: VitalFormValues) => {
    if (!pid) return
    const recordedAt = new Date(v.recordedAt).toISOString()
    const measurements: Partial<Record<VitalKey, number | null>> = {
      systolic: v.systolic,
      diastolic: v.diastolic,
      pulse: v.pulse,
      weightKg: v.weightKg,
      temperatureC: v.temperatureC,
      glucose: v.glucose,
      urineOutputMl: v.urineOutputMl,
    }
    try {
      const id = await addVital(pid, { ...measurements, notes: v.notes, recordedAt })
      const saved: Vital = { id, recordedAt, createdBy: '', ...stripNulls(measurements) }
      const flags = flagsForVital(saved, [...history, saved])
      reset({ ...emptyVitalForm(), recordedAt: toLocalInput() })
      if (flags.length === 0) showToast('success', 'Reading saved')
      onSaved?.(flags)
    } catch (err) {
      console.error('Save vitals failed', err)
      showToast('error', 'Could not save the reading. Check your connection and try again.')
    }
  }

  const num = (key: VitalKey, label: string, opts: { placeholder?: string; className?: string } = {}) => {
    const id = `vital-${variant}-${key}`
    const err = errors[key]?.message
    const lim = VITAL_LIMITS[key]
    return (
      <FormField id={id} label={label} error={err} className={opts.className}>
        <input
          {...register(key)}
          {...fieldA11y(id, err)}
          className="field tabular"
          inputMode={lim.step < 1 ? 'decimal' : 'numeric'}
          autoComplete="off"
          placeholder={opts.placeholder}
        />
      </FormField>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <fieldset className="col-span-2">
          <legend className="label mb-1.5 text-ink-3">Blood pressure (mmHg)</legend>
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <input
                {...register('systolic')}
                {...fieldA11y(`vital-${variant}-systolic`, errors.systolic?.message)}
                aria-label="Systolic (upper)"
                className="field tabular"
                inputMode="numeric"
                placeholder="Upper, e.g. 128"
              />
            </div>
            <span aria-hidden className="pt-2.5 text-ink-3">/</span>
            <div className="flex-1">
              <input
                {...register('diastolic')}
                {...fieldA11y(`vital-${variant}-diastolic`, errors.diastolic?.message)}
                aria-label="Diastolic (lower)"
                className="field tabular"
                inputMode="numeric"
                placeholder="Lower, e.g. 82"
              />
            </div>
          </div>
          {(errors.systolic?.message || errors.diastolic?.message) && (
            <p role="alert" className="mt-1 text-xs text-critical">
              {errors.systolic?.message ?? errors.diastolic?.message}
            </p>
          )}
        </fieldset>
        {num('pulse', 'Pulse (bpm)', { placeholder: '72' })}
        {num('weightKg', 'Weight (kg)', { placeholder: '68.5' })}
        {num('temperatureC', 'Temp (°C)', { placeholder: '36.8' })}
        {variant === 'full' && num('glucose', 'Glucose (mg/dL)', { placeholder: '110' })}
        {variant === 'full' && num('urineOutputMl', 'Urine output (mL)', { placeholder: '1800' })}
        {variant === 'full' && (
          <FormField id="vital-recorded" label="Taken at" error={errors.recordedAt?.message} className="col-span-2">
            <input
              type="datetime-local"
              {...register('recordedAt')}
              {...fieldA11y('vital-recorded', errors.recordedAt?.message)}
              className="field"
            />
          </FormField>
        )}
      </div>
      {variant === 'full' && (
        <FormField id="vital-notes" label="Notes" error={errors.notes?.message}>
          <input {...register('notes')} {...fieldA11y('vital-notes', errors.notes?.message)} className="field" placeholder="e.g. After a walk" />
        </FormField>
      )}
      {rootError && (
        <p role="alert" className="text-xs text-critical">
          {rootError}
        </p>
      )}
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Save reading
      </Button>
    </form>
  )
}

function stripNulls(m: Partial<Record<VitalKey, number | null>>): Partial<Record<VitalKey, number>> {
  const out: Partial<Record<VitalKey, number>> = {}
  for (const [k, v] of Object.entries(m)) if (typeof v === 'number') out[k as VitalKey] = v
  return out
}
