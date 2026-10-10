/**
 * Shared contract for care-circle features built in later phases (visits,
 * vitals, document vault, doctor questions, targets, alerts, dose history,
 * chat, invites, activity). Everything lives under `patients/{pid}/…` unless
 * noted otherwise.
 *
 * Conventions:
 *   - `id` is the Firestore doc id (not stored in the doc body).
 *   - Date-only fields are `YYYY-MM-DD`; timestamps are ISO strings in app
 *     code (Firestore Timestamps converted by the data layer).
 *   - `createdBy` is the author's uid; firestore.rules require
 *     `createdBy == request.auth.uid` on client creates and keep it immutable.
 */
import type { Role } from './member'

// ---- patients/{pid}/visits/{id} ----
export interface Visit {
  id: string
  /** YYYY-MM-DD */
  visitDate: string
  doctorName?: string
  hospital?: string
  purpose?: string
  notes?: string
  /** What the doctor advised. */
  advice?: string
  /** Dose changes made at this visit, as `${medicationId}/${doseChangeId}`. */
  doseChangeRefs?: string[]
  /** labRecords ids reviewed at this visit. */
  linkedRecordIds?: string[]
  /** questions ids raised at this visit. */
  questionIds?: string[]
  /** YYYY-MM-DD */
  nextVisitDate?: string | null
  createdBy: string
  createdAt?: string
  updatedAt?: string
}

// ---- patients/{pid}/vitals/{id} ----
/** One quick-entry reading; any subset of the measurements may be present. */
export interface Vital {
  id: string
  /** ISO timestamp of the measurement. */
  recordedAt: string
  systolic?: number
  diastolic?: number
  pulse?: number
  weightKg?: number
  temperatureC?: number
  /** mg/dL */
  glucose?: number
  /** mL over the logged period */
  urineOutputMl?: number
  notes?: string
  createdBy: string
  createdAt?: string
}

// ---- patients/{pid}/documents/{docId} ----
// File bytes live in Storage at patients/{pid}/documents/{docId}/{fileName}.
export type DocumentKind = 'lab-report' | 'prescription' | 'discharge-summary' | 'imaging' | 'other'

export const DOCUMENT_CONTENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
] as const

/** Mirrors the storage.rules size cap. */
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024

export interface DocumentMeta {
  id: string
  kind: DocumentKind
  title?: string
  fileName: string
  /** Full Storage path: patients/{pid}/documents/{id}/{fileName} */
  storagePath: string
  /** One of DOCUMENT_CONTENT_TYPES */
  contentType: string
  /** Bytes */
  size: number
  /** YYYY-MM-DD the document refers to (report/collection date), if known. */
  documentDate?: string | null
  /** labRecords id this document produced, if any. */
  labRecordId?: string | null
  source?: 'upload' | 'camera' | 'migration'
  /** Original lab-pdfs/{uid}/… path for migrated files. */
  legacyPath?: string
  createdBy: string
  createdAt?: string
}

// ---- patients/{pid}/questions/{id} ----
export type QuestionStatus = 'open' | 'asked' | 'answered'

export interface Question {
  id: string
  text: string
  status: QuestionStatus
  answer?: string
  /** Visit where it was (or will be) asked. */
  visitId?: string | null
  /** 'chat' when proposed by the assistant and confirmed by the user. */
  source?: 'user' | 'chat'
  createdBy: string
  createdAt?: string
  askedAt?: string | null
  answeredAt?: string | null
}

// ---- patients/{pid}/targets/{testName} ----
/** Patient-specific target range set by the doctor. Doc id == REFERENCE_RANGES key. */
export interface Target {
  testName: string
  min?: number | null
  max?: number | null
  unit?: string
  /** Who set it clinically, e.g. the doctor's name. */
  setBy?: string
  notes?: string
  createdBy: string
  createdAt?: string
  updatedAt?: string
}

// ---- patients/{pid}/alertRules/{id} ----
export type AlertOperator = 'above' | 'below' | 'outside-target' | 'change-pct'

export interface AlertRule {
  id: string
  testName: string
  op: AlertOperator
  /** Absolute value for above/below; percent for change-pct; unused for outside-target. */
  threshold?: number | null
  enabled: boolean
  label?: string
  createdBy: string
  createdAt?: string
}

// ---- patients/{pid}/medications/{medicationId}/doseHistory/{id} ----
export interface DoseChange {
  id: string
  medicationId: string
  dose: string
  previousDose?: string | null
  /** YYYY-MM-DD */
  effectiveDate: string
  reason?: string
  visitId?: string | null
  createdBy: string
  createdAt?: string
}

// ---- patients/{pid}/chats/{chatId} (server-written; readable by its creator only) ----
export interface ChatThread {
  id: string
  title: string
  createdBy: string
  createdAt?: string
  updatedAt?: string
  messageCount?: number
}

// ---- patients/{pid}/chats/{chatId}/messages/{id} (server-written) ----
export interface ChatMessage {
  id: string
  role: 'user' | 'model'
  text: string
  /** labRecords ids cited as [YYYY-MM-DD]. */
  citations?: string[]
  /** Names of tools the model called while producing this message. */
  toolCalls?: string[]
  tokensIn?: number
  tokensOut?: number
  createdAt?: string
}

// ---- invites/{id} (top-level, server-only) ----
export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

export interface Invite {
  id: string
  pid: string
  patientName: string
  phoneE164: string
  role: Exclude<Role, 'owner'>
  status: InviteStatus
  invitedBy: string
  invitedByName?: string
  createdAt?: string
  expiresAt: string
  acceptedBy?: string | null
  acceptedAt?: string | null
}

// ---- patients/{pid}/activity/{id} (append-only audit) ----
export type ActivityAction =
  | 'patient.created'
  | 'patient.updated'
  | 'member.added'
  | 'member.role-changed'
  | 'member.removed'
  | 'member.left'
  | 'record.added'
  | 'record.updated'
  | 'record.deleted'
  | 'medication.added'
  | 'medication.updated'
  | 'medication.deleted'
  | 'document.uploaded'
  | 'visit.added'
  | 'question.added'
  | 'target.updated'

export interface ActivityEntry {
  id: string
  actorUid: string
  actorName?: string
  action: ActivityAction
  /** e.g. 'labRecord', 'member', 'medication' */
  targetType?: string
  targetId?: string
  /** Short human summary without medical values, e.g. "Added a report for 12 Mar". */
  summary?: string
  createdAt?: string
}
