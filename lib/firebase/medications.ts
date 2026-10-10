import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore'
import { currentUid, getDb, toIso } from './firestore'
import { logActivity, resolveMyName } from './patients'
import { isDoseChange, type DoseHistoryEntry, type MedicationDoc, type TimeOfDay } from '@/lib/calculations/medications'
import type { MedicationCategory } from '@/lib/types/medication'

export type { DoseHistoryEntry, MedicationDoc, TimeOfDay } from '@/lib/calculations/medications'

/**
 * Medications with dose history.
 *
 *   patients/{pid}/medications/{mid}                    MedicationDoc
 *   patients/{pid}/medications/{mid}/doseHistory/{id}   DoseHistoryEntry
 *
 * Every create and every dose/frequency change writes a doseHistory entry in
 * the same batch as the medication write, then a best-effort activity entry.
 * Stopping keeps the doc (isActive: false + stoppedAt) so history survives.
 */

export interface MedicationInput {
  name: string
  dose: string
  frequency: string
  category: MedicationCategory
  timeOfDay: TimeOfDay[]
  prescribedBy?: string
  notes?: string
  /** YYYY-MM-DD */
  startDate?: string | null
}

export interface DoseChangeMeta {
  /** YYYY-MM-DD the new dose applies from. */
  effectiveDate: string
  reason?: string
  visitId?: string | null
}

const medsCol = (pid: string) => collection(getDb(), 'patients', pid, 'medications')
const medDoc = (pid: string, mid: string) => doc(getDb(), 'patients', pid, 'medications', mid)
const historyCol = (pid: string, mid: string) => collection(getDb(), 'patients', pid, 'medications', mid, 'doseHistory')

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

function dateOnly(v: unknown): string | null {
  const iso = toIso(v)
  return iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null
}

export function medicationFromDoc(id: string, data: DocumentData): MedicationDoc {
  return {
    id,
    name: str(data.name) ?? 'Unnamed',
    dose: str(data.dose) ?? '',
    frequency: str(data.frequency) ?? '',
    category: (str(data.category) as MedicationCategory) ?? 'Other',
    prescribedBy: str(data.prescribedBy),
    isActive: data.isActive !== false,
    notes: str(data.notes),
    createdBy: str(data.createdBy),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    timeOfDay: Array.isArray(data.timeOfDay) ? (data.timeOfDay.filter((t: unknown) => typeof t === 'string') as TimeOfDay[]) : [],
    startDate: dateOnly(data.startDate),
    stoppedAt: dateOnly(data.stoppedAt),
    stopReason: str(data.stopReason),
  }
}

export function doseEntryFromDoc(id: string, medicationId: string, data: DocumentData): DoseHistoryEntry {
  return {
    id,
    medicationId: str(data.medicationId) ?? medicationId,
    dose: str(data.dose) ?? '',
    previousDose: str(data.previousDose) ?? null,
    frequency: str(data.frequency),
    previousFrequency: str(data.previousFrequency) ?? null,
    effectiveDate: dateOnly(data.effectiveDate) ?? dateOnly(data.createdAt) ?? '1970-01-01',
    reason: str(data.reason),
    visitId: str(data.visitId) ?? null,
    createdBy: str(data.createdBy) ?? '',
    changedByName: str(data.changedByName),
    createdAt: toIso(data.createdAt),
  }
}

/** Active first, then by name. */
function sortMeds(meds: MedicationDoc[]): MedicationDoc[] {
  return meds.sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name))
}

/** Realtime medications for a patient (no orderBy: migrated docs may lack createdAt). */
export function subscribeMedications(
  pid: string,
  onNext: (meds: MedicationDoc[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    medsCol(pid),
    (snap) => onNext(sortMeds(snap.docs.map((d) => medicationFromDoc(d.id, d.data())))),
    onError
  )
}

export function subscribeMedication(
  pid: string,
  mid: string,
  onNext: (med: MedicationDoc | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    medDoc(pid, mid),
    (snap) => onNext(snap.exists() ? medicationFromDoc(snap.id, snap.data()) : null),
    onError
  )
}

/** Dose history, oldest first (by effective date, then entry time). */
export function subscribeDoseHistory(
  pid: string,
  mid: string,
  onNext: (entries: DoseHistoryEntry[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    historyCol(pid, mid),
    (snap) =>
      onNext(
        snap.docs
          .map((d) => doseEntryFromDoc(d.id, mid, d.data()))
          .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
      ),
    onError
  )
}

function todayLocal(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Trimmed fields; empty optional strings become '' so edits can clear them. Never undefined (Firestore rejects it). */
function cleanInput(input: MedicationInput): Record<string, unknown> {
  return {
    name: input.name.trim().slice(0, 100),
    dose: input.dose.trim().slice(0, 60),
    frequency: input.frequency.trim().slice(0, 60),
    category: input.category,
    timeOfDay: Array.from(new Set(input.timeOfDay)),
    prescribedBy: (input.prescribedBy ?? '').trim().slice(0, 120),
    notes: (input.notes ?? '').trim().slice(0, 500),
    startDate: input.startDate || null,
  }
}

function historyEntry(
  mid: string,
  fields: { dose: string; frequency: string; previousDose: string | null; previousFrequency: string | null },
  meta: DoseChangeMeta,
  changedByName: string
): Record<string, unknown> {
  return {
    medicationId: mid,
    dose: fields.dose,
    frequency: fields.frequency,
    previousDose: fields.previousDose,
    previousFrequency: fields.previousFrequency,
    effectiveDate: meta.effectiveDate,
    reason: (meta.reason ?? '').trim().slice(0, 300),
    visitId: meta.visitId ?? null,
    createdBy: currentUid(),
    changedByName,
    createdAt: serverTimestamp(),
  }
}

/** Add a medication plus its first doseHistory entry ("Started"). Returns the id. */
export async function addMedication(pid: string, input: MedicationInput): Promise<string> {
  const db = getDb()
  const uid = currentUid()
  const ref = doc(medsCol(pid))
  const fields = cleanInput(input)
  const batch = writeBatch(db)
  batch.set(ref, {
    ...fields,
    isActive: true,
    stoppedAt: null,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  batch.set(
    doc(historyCol(pid, ref.id)),
    historyEntry(
      ref.id,
      { dose: fields.dose as string, frequency: fields.frequency as string, previousDose: null, previousFrequency: null },
      { effectiveDate: input.startDate || todayLocal(), reason: 'Started' },
      await resolveMyName()
    )
  )
  await batch.commit()
  await logActivity(pid, 'medication.added', { targetType: 'medication', targetId: ref.id, summary: `Added ${fields.name}` })
  return ref.id
}

/**
 * Save edits. When dose or frequency changed, also writes a doseHistory
 * entry (same batch) dated `change.effectiveDate`. Returns whether it was a dose change.
 */
export async function updateMedication(
  pid: string,
  current: MedicationDoc,
  input: MedicationInput,
  change: DoseChangeMeta
): Promise<{ doseChanged: boolean }> {
  const db = getDb()
  const fields = cleanInput(input)
  const doseChanged = isDoseChange(current, { dose: fields.dose as string, frequency: fields.frequency as string })
  const batch = writeBatch(db)
  batch.update(medDoc(pid, current.id), { ...fields, updatedAt: serverTimestamp() })
  if (doseChanged) {
    batch.set(
      doc(historyCol(pid, current.id)),
      historyEntry(
        current.id,
        {
          dose: fields.dose as string,
          frequency: fields.frequency as string,
          previousDose: current.dose || null,
          previousFrequency: current.frequency || null,
        },
        change,
        await resolveMyName()
      )
    )
  }
  await batch.commit()
  await logActivity(pid, 'medication.updated', {
    targetType: 'medication',
    targetId: current.id,
    summary: doseChanged ? `Changed ${fields.name} dose` : `Updated ${fields.name}`,
  })
  return { doseChanged }
}

/** Stop (isActive false + stoppedAt). The doc and its history are kept. */
export async function stopMedication(
  pid: string,
  med: Pick<MedicationDoc, 'id' | 'name'>,
  opts: { stoppedAt: string; reason?: string }
): Promise<void> {
  const batch = writeBatch(getDb())
  batch.update(medDoc(pid, med.id), {
    isActive: false,
    stoppedAt: opts.stoppedAt,
    stopReason: (opts.reason ?? '').trim().slice(0, 300),
    updatedAt: serverTimestamp(),
  })
  await batch.commit()
  await logActivity(pid, 'medication.updated', { targetType: 'medication', targetId: med.id, summary: `Stopped ${med.name}` })
}

/** Restart a stopped medication at its current dose; logged as a doseHistory entry ("Restarted"). */
export async function restartMedication(pid: string, med: MedicationDoc, effectiveDate: string): Promise<void> {
  const batch = writeBatch(getDb())
  batch.update(medDoc(pid, med.id), { isActive: true, stoppedAt: null, stopReason: '', updatedAt: serverTimestamp() })
  batch.set(
    doc(historyCol(pid, med.id)),
    historyEntry(
      med.id,
      { dose: med.dose, frequency: med.frequency, previousDose: null, previousFrequency: null },
      { effectiveDate, reason: 'Restarted' },
      await resolveMyName()
    )
  )
  await batch.commit()
  await logActivity(pid, 'medication.updated', { targetType: 'medication', targetId: med.id, summary: `Restarted ${med.name}` })
}
