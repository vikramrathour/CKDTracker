'use client'

import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/tabs'
import { ListSkeleton } from '@/components/ui/skeleton'
import { FormField, fieldA11y } from '@/components/medications/form-field'
import { useCanEdit, usePatient } from '@/components/providers/patient-provider'
import { useToast } from '@/components/providers/toast-provider'
import { updatePatient } from '@/lib/firebase/patients'
import { zodResolver } from '@/lib/hooks/zod-resolver'
import type { Patient, PatientRelationship } from '@/lib/types/patient'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

const ymd = z
  .string()
  .trim()
  .refine((s) => s === '' || /^\d{4}-\d{2}-\d{2}$/.test(s), 'Use a valid date')

const schema = z
  .object({
    displayName: z.string().trim().min(1, 'Please enter a name').max(100, 'Keep it under 100 characters'),
    relationship: z.enum(['self', 'family', 'other']),
    dateOfBirth: ymd,
    transplantDate: ymd,
    doctorName: z.string().trim().max(120, 'Keep it under 120 characters'),
    hospital: z.string().trim().max(160, 'Keep it under 160 characters'),
    nextLabDate: ymd,
  })
  .superRefine((v, ctx) => {
    const max = today()
    if (v.dateOfBirth && v.dateOfBirth > max)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dateOfBirth'], message: 'Can’t be in the future' })
    if (v.transplantDate && v.transplantDate > max)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['transplantDate'], message: 'Can’t be in the future' })
    if (v.dateOfBirth && v.transplantDate && v.transplantDate < v.dateOfBirth)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['transplantDate'], message: 'Before the date of birth' })
  })

type FormInput = z.input<typeof schema>
type FormValues = z.output<typeof schema>

const RELATIONSHIP_LABEL: Record<PatientRelationship, string> = {
  self: 'Your own profile',
  family: 'Family',
  other: 'Someone else',
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(`${value}T00:00:00`)
  return isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function PatientProfilePage() {
  const { activePatient, loading } = usePatient()
  const canEdit = useCanEdit()

  return (
    <>
      <Header title="Patient profile" emphasis="profile" subtitle="Details shared with the care circle" />
      <main className="px-4 pb-8 pt-6">
        {loading || !activePatient ? (
          <ListSkeleton rows={4} />
        ) : (
          <>
            <p className="eyebrow mb-3">{RELATIONSHIP_LABEL[activePatient.relationship ?? 'family']}</p>
            <h2 className="font-serif text-[2rem] font-normal leading-[1.1] tracking-[-.02em] text-ink">
              About <em className="italic text-terra-dk">{activePatient.displayName}</em>
            </h2>
            <p className="mt-3 max-w-[38ch] text-[15px] text-ink-2">
              Everyone in the care circle sees these details. They feed age-based analysis, the visit summary and lab
              reminders.
            </p>
            {canEdit ? (
              <PatientForm key={`${activePatient.id}:${activePatient.updatedAt ?? ''}`} patient={activePatient} />
            ) : (
              <PatientDetails patient={activePatient} />
            )}
          </>
        )}
      </main>
    </>
  )
}

function PatientDetails({ patient }: { patient: Patient }) {
  const rows: [string, string][] = [
    ['Name', patient.displayName],
    ['Relationship', RELATIONSHIP_LABEL[patient.relationship ?? 'family']],
    ['Date of birth', formatDate(patient.dateOfBirth)],
    ['Transplant date', formatDate(patient.transplantDate)],
    ['Doctor', patient.doctorName || '—'],
    ['Hospital', patient.hospital || '—'],
    ['Next lab test', formatDate(patient.nextLabDate)],
  ]
  return (
    <>
      <dl className="mt-7 rounded-card border border-hair bg-vellum px-4">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 border-t border-hair py-3 first:border-t-0">
            <dt className="label text-ink-3">{k}</dt>
            <dd className="min-w-0 truncate text-right text-[15px] text-ink tabular">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-center text-xs text-ink-3">View only: owners and editors can change these details.</p>
    </>
  )
}

function PatientForm({ patient }: { patient: Patient }) {
  const { refreshPatients } = usePatient()
  const { showToast } = useToast()
  const isSelf = patient.relationship === 'self'
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: patient.displayName,
      relationship: patient.relationship ?? 'family',
      dateOfBirth: patient.dateOfBirth ?? '',
      transplantDate: patient.transplantDate ?? '',
      doctorName: patient.doctorName ?? '',
      hospital: patient.hospital ?? '',
      nextLabDate: patient.nextLabDate ?? '',
    },
  })
  const relationship = watch('relationship')

  const onSave = async (v: FormValues) => {
    try {
      await updatePatient(patient.id, {
        displayName: v.displayName,
        // pid == uid profiles stay 'self'; care profiles choose family/other.
        ...(isSelf ? {} : { relationship: v.relationship }),
        dateOfBirth: v.dateOfBirth || null,
        transplantDate: v.transplantDate || null,
        doctorName: v.doctorName,
        hospital: v.hospital,
        nextLabDate: v.nextLabDate || null,
      })
      await refreshPatients()
      showToast('success', 'Profile saved')
    } catch (err) {
      console.error('Save patient failed', err)
      showToast('error', 'Could not save the profile.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSave)} noValidate className="mt-7 space-y-6">
      <section className="space-y-4 rounded-card border border-hair bg-vellum p-4">
        <h3 className="label text-ink-3">About</h3>
        <FormField id="pt-name" label="Name" error={errors.displayName?.message}>
          <input {...register('displayName')} {...fieldA11y('pt-name', errors.displayName?.message)} maxLength={100} className="field" />
        </FormField>
        {!isSelf && (
          <div>
            <span className="label mb-1.5 block text-ink-3">Relationship</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Relationship">
              {(['family', 'other'] as const).map((r) => (
                <Chip
                  key={r}
                  selected={relationship === r}
                  onClick={() => setValue('relationship', r, { shouldDirty: true })}
                >
                  {RELATIONSHIP_LABEL[r]}
                </Chip>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-3">
          <FormField id="pt-dob" label="Date of birth" error={errors.dateOfBirth?.message} className="flex-1">
            <input type="date" max={today()} {...register('dateOfBirth')} {...fieldA11y('pt-dob', errors.dateOfBirth?.message)} className="field tabular" />
          </FormField>
          <FormField id="pt-tx" label="Transplant date" error={errors.transplantDate?.message} className="flex-1">
            <input type="date" max={today()} {...register('transplantDate')} {...fieldA11y('pt-tx', errors.transplantDate?.message)} className="field tabular" />
          </FormField>
        </div>
      </section>

      <section className="space-y-4 rounded-card border border-hair bg-vellum p-4">
        <h3 className="label text-ink-3">Care team</h3>
        <FormField id="pt-doctor" label="Doctor" error={errors.doctorName?.message}>
          <input {...register('doctorName')} {...fieldA11y('pt-doctor', errors.doctorName?.message)} maxLength={120} placeholder="e.g. Dr. A. Sharma" className="field" />
        </FormField>
        <FormField id="pt-hospital" label="Hospital" error={errors.hospital?.message}>
          <input {...register('hospital')} {...fieldA11y('pt-hospital', errors.hospital?.message)} maxLength={160} className="field" />
        </FormField>
        <FormField
          id="pt-nextlab"
          label="Next lab test"
          error={errors.nextLabDate?.message}
          help="A reminder goes out the day before, if notifications are on."
        >
          <input type="date" {...register('nextLabDate')} {...fieldA11y('pt-nextlab', errors.nextLabDate?.message, true)} className="field tabular" />
        </FormField>
      </section>

      <Button type="submit" size="lg" className="w-full" loading={isSubmitting} disabled={!isDirty}>
        Save profile
      </Button>
    </form>
  )
}
