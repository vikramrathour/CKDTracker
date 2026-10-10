'use client'

import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/tabs'
import { zodResolver } from '@/lib/hooks/zod-resolver'
import { isDoseChange, TIMES_OF_DAY, type MedicationDoc, type TimeOfDay } from '@/lib/calculations/medications'
import { FormField, fieldA11y } from './form-field'
import {
  FREQUENCY_SUGGESTIONS,
  MEDICATION_CATEGORIES,
  medicationFormSchema,
  todayISODate,
  type MedicationFormInput,
  type MedicationFormValues,
} from './medication-schema'

const TIME_LABELS: Record<TimeOfDay, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
}

function defaults(med: MedicationDoc | null): MedicationFormInput {
  return {
    name: med?.name ?? '',
    dose: med?.dose ?? '',
    frequency: med?.frequency ?? '',
    category: med?.category ?? 'Other',
    timeOfDay: med?.timeOfDay ?? [],
    prescribedBy: med?.prescribedBy ?? '',
    notes: med?.notes ?? '',
    startDate: med?.startDate ?? (med ? '' : todayISODate()),
    changeDate: todayISODate(),
    changeReason: '',
  }
}

/**
 * Add / edit a medication. On edit, changing dose or frequency reveals
 * "effective from" and "reason" fields, which become the doseHistory entry.
 */
export function MedicationForm({
  medication,
  onSubmit,
  onCancel,
}: {
  medication: MedicationDoc | null
  onSubmit: (values: MedicationFormValues) => Promise<void>
  onCancel?: () => void
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<MedicationFormInput, unknown, MedicationFormValues>({
    resolver: zodResolver(medicationFormSchema),
    defaultValues: defaults(medication),
  })

  const timeOfDay = watch('timeOfDay')
  const dose = watch('dose')
  const frequency = watch('frequency')
  const doseChanged = medication != null && isDoseChange(medication, { dose, frequency })

  const toggleTime = (t: TimeOfDay) => {
    const next = timeOfDay.includes(t) ? timeOfDay.filter((x) => x !== t) : [...timeOfDay, t]
    setValue(
      'timeOfDay',
      TIMES_OF_DAY.filter((x) => next.includes(x)),
      { shouldDirty: true }
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <FormField id="med-name" label="Name" error={errors.name?.message}>
        <input
          {...register('name')}
          {...fieldA11y('med-name', errors.name?.message)}
          className="field"
          autoComplete="off"
          placeholder="e.g. Tacrolimus"
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField id="med-dose" label="Dose" error={errors.dose?.message}>
          <input
            {...register('dose')}
            {...fieldA11y('med-dose', errors.dose?.message)}
            className="field"
            autoComplete="off"
            placeholder="1 mg"
          />
        </FormField>
        <FormField id="med-category" label="Category" error={errors.category?.message}>
          <select {...register('category')} {...fieldA11y('med-category', errors.category?.message)} className="field">
            {MEDICATION_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <FormField id="med-frequency" label="Frequency" error={errors.frequency?.message}>
        <input
          {...register('frequency')}
          {...fieldA11y('med-frequency', errors.frequency?.message)}
          className="field"
          list="med-frequency-options"
          autoComplete="off"
          placeholder="Twice daily (12-hourly)"
        />
        <datalist id="med-frequency-options">
          {FREQUENCY_SUGGESTIONS.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </FormField>

      {doseChanged && (
        <div className="space-y-3 rounded-card border border-terra/40 bg-terra-pale p-3">
          <p className="text-[13px] font-semibold text-terra-dk">
            Dose change: {medication.dose} {medication.frequency && `· ${medication.frequency}`} → {dose}
            {frequency && ` · ${frequency}`}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="med-change-date" label="Effective from" error={errors.changeDate?.message}>
              <input
                type="date"
                {...register('changeDate')}
                {...fieldA11y('med-change-date', errors.changeDate?.message)}
                className="field"
              />
            </FormField>
            <FormField id="med-change-reason" label="Reason" error={errors.changeReason?.message}>
              <input
                {...register('changeReason')}
                {...fieldA11y('med-change-reason', errors.changeReason?.message)}
                className="field"
                placeholder="e.g. Level high"
              />
            </FormField>
          </div>
        </div>
      )}

      <fieldset>
        <legend className="label mb-1.5 text-ink-3">When it’s taken</legend>
        <div className="flex flex-wrap gap-2">
          {TIMES_OF_DAY.map((t) => (
            <Chip key={t} selected={timeOfDay.includes(t)} onClick={() => toggleTime(t)}>
              {TIME_LABELS[t]}
            </Chip>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink-3">Used for reminders later.</p>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <FormField id="med-prescribed" label="Prescribed by" error={errors.prescribedBy?.message}>
          <input
            {...register('prescribedBy')}
            {...fieldA11y('med-prescribed', errors.prescribedBy?.message)}
            className="field"
            placeholder="Doctor"
          />
        </FormField>
        <FormField id="med-start" label="Started" error={errors.startDate?.message}>
          <input
            type="date"
            max={todayISODate()}
            {...register('startDate')}
            {...fieldA11y('med-start', errors.startDate?.message)}
            className="field"
          />
        </FormField>
      </div>

      <FormField id="med-notes" label="Notes" error={errors.notes?.message}>
        <textarea
          {...register('notes')}
          {...fieldA11y('med-notes', errors.notes?.message)}
          className="field min-h-[72px]"
          rows={2}
          placeholder="e.g. Take on an empty stomach"
        />
      </FormField>

      <div className="flex gap-2 pt-1">
        {onCancel && (
          <Button variant="ghost" className="flex-1" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" className="flex-1" loading={isSubmitting}>
          {medication ? 'Save changes' : 'Add medication'}
        </Button>
      </div>
    </form>
  )
}

export { TIME_LABELS }
