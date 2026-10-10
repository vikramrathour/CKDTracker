'use client'

import { useMemo, useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { usePatient } from '@/components/providers/patient-provider'
import { formatDate, cn } from '@/lib/utils'
import type { VisitRecord } from '@/lib/visits/types'
import type { VisitInput } from '@/lib/firebase/visits'
import type { Question } from '@/lib/types/care'

const ymd = /^\d{4}-\d{2}-\d{2}$/
const optText = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters`)

export const visitSchema = z
  .object({
    visitDate: z.string().regex(ymd, 'Pick a date'),
    visitTime: z.string().regex(/^(\d{2}:\d{2})?$/, 'Use HH:MM'),
    doctorName: optText(120),
    hospital: optText(160),
    purpose: optText(300),
    notes: optText(4000),
    advice: optText(4000),
    doseChanges: optText(2000),
    nextVisitDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Pick a date'),
    linkedRecordIds: z.array(z.string()),
    questionIds: z.array(z.string()),
  })
  .refine((v) => !v.nextVisitDate || v.nextVisitDate > v.visitDate, {
    path: ['nextVisitDate'],
    message: 'The next visit must be after this one',
  })

export type VisitFormValues = z.infer<typeof visitSchema>

/** Minimal zod → react-hook-form resolver (@hookform/resolvers isn't installed). */
const resolver: Resolver<VisitFormValues> = async (values) => {
  const parsed = visitSchema.safeParse(values)
  if (parsed.success) return { values: parsed.data, errors: {} }
  const errors: Record<string, { type: string; message: string }> = {}
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0])
    if (!errors[key]) errors[key] = { type: issue.code, message: issue.message }
  }
  return { values: {}, errors: errors as never }
}

export function toVisitInput(v: VisitFormValues): VisitInput {
  return {
    visitDate: v.visitDate,
    visitTime: v.visitTime || null,
    doctorName: v.doctorName,
    hospital: v.hospital,
    purpose: v.purpose,
    notes: v.notes,
    advice: v.advice,
    doseChanges: v.doseChanges,
    nextVisitDate: v.nextVisitDate || null,
    linkedRecordIds: v.linkedRecordIds,
    questionIds: v.questionIds,
  }
}

function Field({ label, htmlFor, error, children, hint }: { label: string; htmlFor: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="label mb-1.5 block text-ink-3">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-critical">{error}</p>}
    </div>
  )
}

interface VisitFormProps {
  initial?: Partial<VisitRecord>
  questions: Question[]
  submitLabel: string
  onSubmit: (values: VisitFormValues) => Promise<void>
  onCancel: () => void
}

export function VisitForm({ initial, questions, submitLabel, onSubmit, onCancel }: VisitFormProps) {
  const { records, activePatient } = usePatient()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showAllRecords, setShowAllRecords] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<VisitFormValues>({
    resolver,
    defaultValues: {
      visitDate: initial?.visitDate ?? '',
      visitTime: initial?.visitTime ?? '',
      doctorName: initial?.doctorName ?? activePatient?.doctorName ?? '',
      hospital: initial?.hospital ?? activePatient?.hospital ?? '',
      purpose: initial?.purpose ?? '',
      notes: initial?.notes ?? '',
      advice: initial?.advice ?? '',
      doseChanges: initial?.doseChanges ?? '',
      nextVisitDate: initial?.nextVisitDate ?? '',
      linkedRecordIds: initial?.linkedRecordIds ?? [],
      questionIds: initial?.questionIds ?? [],
    },
  })

  const visitDate = watch('visitDate')
  const linked = watch('linkedRecordIds')

  // Records newest first; by default the ones on or before the visit date (latest 8).
  const recordOptions = useMemo(() => {
    const sorted = [...records].sort((a, b) => b.recordDate.localeCompare(a.recordDate))
    if (showAllRecords) return sorted
    const before = sorted.filter((r) => !visitDate || r.recordDate.slice(0, 10) <= visitDate).slice(0, 8)
    const extra = sorted.filter((r) => linked?.includes(r.id) && !before.includes(r))
    return [...before, ...extra]
  }, [records, visitDate, showAllRecords, linked])

  // Questions: unanswered ones, plus any already linked to this visit.
  const questionOptions = questions.filter(
    (q) => q.status !== 'answered' || initial?.questionIds?.includes(q.id) || (initial?.id && q.visitId === initial.id)
  )

  const submit = handleSubmit(async (values) => {
    setSaveError(null)
    try {
      await onSubmit(values)
    } catch (err) {
      console.error('Visit save failed:', err)
      setSaveError('Could not save the visit. Check your connection and try again.')
    }
  })

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="visit-date" error={errors.visitDate?.message}>
          <input id="visit-date" type="date" className="field tabular" {...register('visitDate')} />
        </Field>
        <Field label="Time" htmlFor="visit-time" error={errors.visitTime?.message}>
          <input id="visit-time" type="time" className="field tabular" {...register('visitTime')} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Doctor" htmlFor="visit-doctor" error={errors.doctorName?.message}>
          <input id="visit-doctor" className="field" autoComplete="off" {...register('doctorName')} />
        </Field>
        <Field label="Hospital" htmlFor="visit-hospital" error={errors.hospital?.message}>
          <input id="visit-hospital" className="field" autoComplete="off" {...register('hospital')} />
        </Field>
      </div>
      <Field label="Purpose" htmlFor="visit-purpose" error={errors.purpose?.message}>
        <input id="visit-purpose" className="field" placeholder="Routine follow-up, review reports…" {...register('purpose')} />
      </Field>
      <Field label="Notes" htmlFor="visit-notes" error={errors.notes?.message}>
        <textarea id="visit-notes" rows={3} className="field" {...register('notes')} />
      </Field>
      <Field label="Doctor’s advice" htmlFor="visit-advice" error={errors.advice?.message}>
        <textarea id="visit-advice" rows={3} className="field" {...register('advice')} />
      </Field>
      <Field
        label="Dose changes"
        htmlFor="visit-doses"
        error={errors.doseChanges?.message}
        hint="Free text, e.g. “Tacrolimus 2 mg → 1.5 mg twice daily”. Update the medication list too."
      >
        <textarea id="visit-doses" rows={2} className="field" {...register('doseChanges')} />
      </Field>
      <Field label="Next visit" htmlFor="visit-next" error={errors.nextVisitDate?.message}>
        <input id="visit-next" type="date" className="field tabular" {...register('nextVisitDate')} />
      </Field>

      <fieldset>
        <legend className="label mb-1.5 text-ink-3">Reports reviewed</legend>
        {recordOptions.length === 0 ? (
          <p className="text-sm text-ink-3">No lab reports yet.</p>
        ) : (
          <ul className="border-t border-hair-2">
            {recordOptions.map((r) => (
              <li key={r.id} className="border-b border-hair-2">
                <label className="flex min-h-[44px] cursor-pointer items-center gap-3 py-1.5 text-sm">
                  <input type="checkbox" value={r.id} className="h-4 w-4 accent-[rgb(var(--terra))]" {...register('linkedRecordIds')} />
                  <span className="tabular text-ink">{formatDate(r.recordDate, 'd MMM yyyy')}</span>
                  <span className="truncate text-ink-3">{r.labName || 'Lab'} · {r.values.length} tests</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {!showAllRecords && records.length > recordOptions.length && (
          <button type="button" className="tlink mt-2 text-[13px]" onClick={() => setShowAllRecords(true)}>
            Show all {records.length} reports
          </button>
        )}
      </fieldset>

      <fieldset>
        <legend className="label mb-1.5 text-ink-3">Questions for this visit</legend>
        {questionOptions.length === 0 ? (
          <p className="text-sm text-ink-3">No open questions. Add them on the Questions page.</p>
        ) : (
          <ul className="border-t border-hair-2">
            {questionOptions.map((q) => (
              <li key={q.id} className="border-b border-hair-2">
                <label className="flex min-h-[44px] cursor-pointer items-start gap-3 py-2 text-sm">
                  <input type="checkbox" value={q.id} className="mt-1 h-4 w-4 accent-[rgb(var(--terra))]" {...register('questionIds')} />
                  <span className={cn('text-ink', q.status === 'answered' && 'text-ink-3 line-through')}>{q.text}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      {saveError && <p role="alert" className="text-sm text-critical">{saveError}</p>}

      <div className="flex gap-3 pt-1">
        <Button variant="secondary" onClick={onCancel} className="flex-1">Cancel</Button>
        <Button type="submit" loading={isSubmitting} className="flex-[2]">{submitLabel}</Button>
      </div>
    </form>
  )
}
