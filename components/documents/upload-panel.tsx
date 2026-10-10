'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { uploadDocument } from '@/lib/firebase/storage'
import { logActivity } from '@/lib/firebase/patients'
import type { DocumentKind } from '@/lib/types/care'
import { DOCUMENT_KINDS, FilePickers, formatBytes, prepareVaultFile } from './shared'

/** Add a file to the vault: kind, title, date, then a PDF or a camera photo. */
export function UploadPanel({ pid, onUploaded }: { pid: string; onUploaded: (docId: string, kind: DocumentKind) => void }) {
  const [kind, setKind] = useState<DocumentKind>('lab-report')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [camera, setCamera] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = (raw: File, fromCamera: boolean) => {
    const prepared = prepareVaultFile(raw)
    if ('error' in prepared) {
      setError(prepared.error)
      setFile(null)
      return
    }
    setError(null)
    setFile(prepared.file)
    setCamera(fromCamera)
    if (!title) setTitle(fromCamera ? '' : raw.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 200))
  }

  const upload = async () => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const fallbackTitle = `${DOCUMENT_KINDS.find((k) => k.id === kind)?.label ?? 'Document'}${date ? ` ${date}` : ''}`
      const { docId } = await uploadDocument(pid, file, {
        kind,
        title: (title.trim() || fallbackTitle).slice(0, 200),
        documentDate: date || null,
        source: camera ? 'camera' : 'upload',
      })
      logActivity(pid, 'document.uploaded', { targetType: 'document', targetId: docId, summary: 'Uploaded a document' })
      setFile(null)
      setTitle('')
      setDate('')
      onUploaded(docId, kind)
    } catch (err) {
      console.error('Upload failed:', err)
      setError('Could not upload the file. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-card border border-hair bg-vellum p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="doc-kind" className="label mb-1.5 block text-ink-3">Kind</label>
          <select id="doc-kind" className="field" value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
            {DOCUMENT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="doc-date" className="label mb-1.5 block text-ink-3">Date</label>
          <input id="doc-date" type="date" className="field tabular" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <label htmlFor="doc-title" className="label mb-1.5 mt-3 block text-ink-3">Title</label>
      <input id="doc-title" className="field" maxLength={200} value={title} placeholder="e.g. Discharge summary, March" onChange={(e) => setTitle(e.target.value)} />

      <div className="mt-4">
        <FilePickers onPick={pick} disabled={busy} />
        {file && (
          <p className="mt-2 truncate text-sm text-ink-2">
            {file.name} <span className="text-ink-3">· {formatBytes(file.size)}</span>
          </p>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-critical">{error}</p>}
      <Button className="mt-4 w-full" disabled={!file} loading={busy} onClick={upload}>Upload</Button>
    </div>
  )
}
