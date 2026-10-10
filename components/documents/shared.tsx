'use client'

import { useRef } from 'react'
import { Camera, FileText, FileImage, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePatientSubscription } from '@/components/records/use-patient-subscription'
import { subscribeDocuments } from '@/lib/firebase/documents'
import { DOCUMENT_CONTENT_TYPES, DOCUMENT_MAX_BYTES, type DocumentKind } from '@/lib/types/care'

export const DOCUMENT_KINDS: { id: DocumentKind; label: string }[] = [
  { id: 'lab-report', label: 'Lab report' },
  { id: 'prescription', label: 'Prescription' },
  { id: 'discharge-summary', label: 'Discharge summary' },
  { id: 'imaging', label: 'Imaging' },
  { id: 'other', label: 'Other' },
]

export const KIND_LABEL: Record<string, string> = Object.fromEntries(DOCUMENT_KINDS.map((k) => [k.id, k.label]))

export const DOCUMENT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif'

export function useDocuments() {
  const { items, loading, error } = usePatientSubscription(subscribeDocuments, 'documents')
  return { documents: items, loading, error }
}

/**
 * Normalise a picked file for the vault: browsers often report HEIC photos
 * with an empty type or image/heif. Returns an error message when the file
 * can't be stored (mirrors storage.rules).
 */
export function prepareVaultFile(file: File): { file: File } | { error: string } {
  let type = file.type
  if (!type || type === 'image/heif') {
    const ext = file.name.toLowerCase().split('.').pop()
    if (ext === 'heic' || ext === 'heif' || type === 'image/heif') type = 'image/heic'
    else if (ext === 'pdf') type = 'application/pdf'
    else if (ext === 'jpg' || ext === 'jpeg') type = 'image/jpeg'
    else if (ext === 'png') type = 'image/png'
    else if (ext === 'webp') type = 'image/webp'
  }
  if (!(DOCUMENT_CONTENT_TYPES as readonly string[]).includes(type)) {
    return { error: 'Only PDF, JPEG, PNG, WebP or HEIC files can be stored.' }
  }
  if (file.size >= DOCUMENT_MAX_BYTES) return { error: 'Files must be under 20 MB.' }
  return { file: type === file.type ? file : new File([file], file.name, { type, lastModified: file.lastModified }) }
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function DocIcon({ contentType, className }: { contentType: string; className?: string }) {
  return contentType === 'application/pdf' ? <FileText className={className} aria-hidden /> : <FileImage className={className} aria-hidden />
}

/**
 * "Choose file" + "Take photo" (camera via capture="environment").
 * `onPick` receives the raw file and whether it came from the camera.
 */
export function FilePickers({ onPick, disabled }: { onPick: (file: File, camera: boolean) => void; disabled?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const camRef = useRef<HTMLInputElement>(null)
  const handle = (camera: boolean) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) onPick(f, camera)
  }
  return (
    <div className="flex flex-wrap gap-3">
      <input ref={fileRef} type="file" accept={DOCUMENT_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={handle(false)} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={handle(true)} />
      <Button variant="secondary" disabled={disabled} onClick={() => fileRef.current?.click()}>
        <Upload className="h-4 w-4" aria-hidden /> Choose file
      </Button>
      <Button variant="secondary" disabled={disabled} onClick={() => camRef.current?.click()}>
        <Camera className="h-4 w-4" aria-hidden /> Take photo
      </Button>
    </div>
  )
}
