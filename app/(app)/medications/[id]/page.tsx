'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { Pencil } from 'lucide-react'
import { Header, iconButton } from '@/components/layout/header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { CardSkeleton, ChartSkeleton } from '@/components/ui/skeleton'
import { useCanEdit, usePatient } from '@/components/providers/patient-provider'
import { useToast } from '@/components/providers/toast-provider'
import { DoseLevelChart } from '@/components/medications/dose-level-chart'
import { DoseHistoryTimeline } from '@/components/medications/dose-history'
import { FormField, fieldA11y } from '@/components/medications/form-field'
import { TIME_LABELS } from '@/components/medications/medication-form'
import { stopFormSchema, todayISODate, type StopFormInput, type StopFormValues } from '@/components/medications/medication-schema'
import { useDoseHistory, useMedication } from '@/lib/hooks/use-medications'
import { useTargets } from '@/lib/hooks/use-targets'
import { useLabRecords } from '@/lib/hooks/use-lab-records'
import { zodResolver } from '@/lib/hooks/zod-resolver'
import { levelTestForMedication, showsDoseChart } from '@/lib/calculations/medications'
import { restartMedication, stopMedication } from '@/lib/firebase/medications'
import { formatDate } from '@/lib/utils'

export default function MedicationDetailPage() {
  const params = useParams<{ id: string }>()
  const mid = typeof params?.id === 'string' ? params.id : null
  const router = useRouter()
  const { pid } = usePatient()
  const canEdit = useCanEdit()
  const { showToast } = useToast()
  const { medication, loading, error } = useMedication(mid)
  const { history, loading: historyLoading } = useDoseHistory(mid)
  const { targetMap } = useTargets()
  const { records } = useLabRecords()
  const [stopOpen, setStopOpen] = useState(false)
  const [restarting, setRestarting] = useState(false)

  const stopForm = useForm<StopFormInput, unknown, StopFormValues>({
    resolver: zodResolver(stopFormSchema),
    defaultValues: { stoppedAt: todayISODate(), reason: '' },
  })

  const onStop = async (v: StopFormValues) => {
    if (!pid || !medication) return
    try {
      await stopMedication(pid, medication, { stoppedAt: v.stoppedAt, reason: v.reason })
      setStopOpen(false)
      showToast('success', `${medication.name} marked as stopped`)
    } catch (err) {
      console.error('Stop medication failed', err)
      showToast('error', 'Could not update the medication.')
    }
  }

  const onRestart = async () => {
    if (!pid || !medication) return
    setRestarting(true)
    try {
      await restartMedication(pid, medication, todayISODate())
      showToast('success', `${medication.name} restarted`)
    } catch (err) {
      console.error('Restart medication failed', err)
      showToast('error', 'Could not update the medication.')
    } finally {
      setRestarting(false)
    }
  }

  const title = medication?.name ?? 'Medication'

  return (
    <>
      <Header
        title={title}
        showBack
        actions={
          canEdit && medication ? (
            <button type="button" className={iconButton} aria-label="Edit medication" onClick={() => router.push(`/medications/${medication.id}/edit`)}>
              <Pencil className="h-5 w-5" />
            </button>
          ) : null
        }
      />
      <main className="space-y-3.5 px-4 py-4">
        {loading ? (
          <>
            <CardSkeleton />
            <ChartSkeleton />
          </>
        ) : error ? (
          <p role="alert" className="py-6 text-center text-sm text-critical">{error}</p>
        ) : !medication ? (
          <div className="py-10 text-center text-sm text-ink-2">
            This medication no longer exists.{' '}
            <Link href="/medications" className="tlink font-semibold">Back to medications</Link>
          </div>
        ) : (
          <>
            <section className="rounded-card border border-hair bg-vellum p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="num text-[28px] leading-none text-ink">{medication.dose}</div>
                  <div className="mt-1 text-[13px] text-ink-2">{medication.frequency}</div>
                </div>
                <Badge variant={medication.isActive ? 'good' : 'neutral'}>{medication.isActive ? 'Current' : 'Stopped'}</Badge>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-hair pt-3 text-[13px]">
                <Item label="Category" value={medication.category} />
                <Item
                  label="Taken"
                  value={(medication.timeOfDay ?? []).map((t) => TIME_LABELS[t]).join(', ') || '—'}
                />
                <Item label="Prescribed by" value={medication.prescribedBy || '—'} />
                <Item label="Started" value={medication.startDate ? formatDate(medication.startDate, 'dd MMM yyyy') : '—'} />
                {!medication.isActive && (
                  <Item
                    label="Stopped"
                    value={`${medication.stoppedAt ? formatDate(medication.stoppedAt, 'dd MMM yyyy') : '—'}${medication.stopReason ? ` · ${medication.stopReason}` : ''}`}
                    wide
                  />
                )}
                {medication.notes && <Item label="Notes" value={medication.notes} wide />}
              </dl>
              {canEdit && (
                <div className="mt-4 flex gap-2">
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => router.push(`/medications/${medication.id}/edit`)}>
                    Change dose / edit
                  </Button>
                  {medication.isActive ? (
                    <Button variant="danger" size="sm" className="flex-1" onClick={() => setStopOpen(true)}>
                      Stop
                    </Button>
                  ) : (
                    <Button variant="terra" size="sm" className="flex-1" loading={restarting} onClick={onRestart}>
                      Restart today
                    </Button>
                  )}
                </div>
              )}
            </section>

            {showsDoseChart(medication) && (
              <DoseLevelChart
                medication={medication}
                history={history}
                records={records}
                levelTest={levelTestForMedication(medication)}
                targets={targetMap}
              />
            )}

            <section className="rounded-card border border-hair bg-vellum p-4">
              <h2 className="label mb-3 text-ink-3">Dose history</h2>
              <DoseHistoryTimeline history={history} loading={historyLoading} />
            </section>

            <Modal open={stopOpen} onClose={() => setStopOpen(false)} title={`Stop ${medication.name}`}>
              <form onSubmit={stopForm.handleSubmit(onStop)} noValidate className="space-y-4">
                <p className="text-[13px] text-ink-2">It stays in the list under “Stopped” with its dose history.</p>
                <FormField id="stop-date" label="Stopped on" error={stopForm.formState.errors.stoppedAt?.message}>
                  <input
                    type="date"
                    max={todayISODate()}
                    {...stopForm.register('stoppedAt')}
                    {...fieldA11y('stop-date', stopForm.formState.errors.stoppedAt?.message)}
                    className="field"
                  />
                </FormField>
                <FormField id="stop-reason" label="Reason (optional)" error={stopForm.formState.errors.reason?.message}>
                  <input
                    {...stopForm.register('reason')}
                    {...fieldA11y('stop-reason', stopForm.formState.errors.reason?.message)}
                    className="field"
                    placeholder="e.g. Course completed"
                  />
                </FormField>
                <div className="flex gap-2">
                  <Button variant="ghost" className="flex-1" onClick={() => setStopOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="danger" className="flex-1" loading={stopForm.formState.isSubmitting}>
                    Stop medication
                  </Button>
                </div>
              </form>
            </Modal>
          </>
        )}
      </main>
    </>
  )
}

function Item({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <dt className="text-[10px] font-bold uppercase tracking-[.08em] text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  )
}
