'use client'

import Link from 'next/link'
import { Suspense, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ScanText } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { usePatient, useCanEdit } from '@/components/providers/patient-provider'
import { Button } from '@/components/ui/button'
import { ListSkeleton } from '@/components/ui/skeleton'
import { DOCUMENT_KINDS, KIND_LABEL, formatBytes, useDocuments } from '@/components/documents/shared'
import { DocumentPreview } from '@/components/documents/document-preview'
import { ExtractReview } from '@/components/documents/extract-review'
import { deleteDocument, updateDocumentMeta } from '@/lib/firebase/documents'
import { formatDate } from '@/lib/utils'
import type { DocumentKind } from '@/lib/types/care'

function DocumentDetail() {
  const { id } = useParams<{ id: string }>()
  const params = useSearchParams()
  const router = useRouter()
  const { pid, records } = usePatient()
  const canEdit = useCanEdit()
  const { documents, loading } = useDocuments()
  const doc = documents.find((d) => d.id === id)
  const [extracting, setExtracting] = useState(params.get('extract') === '1')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ kind: 'other' as DocumentKind, title: '', documentDate: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) return <ListSkeleton rows={3} />
  if (!doc || !pid) return <p className="pt-16 text-center text-[15px] text-ink-2">This document no longer exists.</p>

  const record = doc.labRecordId ? records.find((r) => r.id === doc.labRecordId) : null
  const canExtract = canEdit && doc.kind === 'lab-report' && !doc.labRecordId

  const handleDelete = async () => {
    const msg = doc.labRecordId
      ? 'Delete this file? The lab values saved from it are kept.'
      : 'Delete this document? This cannot be undone.'
    if (!confirm(msg)) return
    setBusy(true)
    try {
      await deleteDocument(pid, doc)
      router.replace('/documents')
    } catch (err) {
      console.error('Delete failed:', err)
      setError('Could not delete the document. Please try again.')
      setBusy(false)
    }
  }

  const saveMeta = async () => {
    setBusy(true)
    setError(null)
    try {
      await updateDocumentMeta(pid, doc.id, {
        kind: form.kind,
        title: form.title.trim().slice(0, 200) || doc.fileName,
        documentDate: form.documentDate || null,
      })
      setEditing(false)
    } catch (err) {
      console.error('Update failed:', err)
      setError('Could not save. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (extracting && canExtract) {
    return (
      <>
        <p className="eyebrow mb-1">Extract values</p>
        <h2 className="mb-5 font-serif text-[1.375rem] leading-tight text-ink">{doc.title || doc.fileName}</h2>
        <ExtractReview
          source={{ kind: 'document', doc }}
          onCancel={() => setExtracting(false)}
          onSaved={(recordId) => router.replace(`/records/${recordId}`)}
        />
      </>
    )
  }

  return (
    <>
      <p className="eyebrow">{KIND_LABEL[doc.kind] ?? 'Document'}</p>
      <h2 className="mt-1 break-words font-serif text-[1.625rem] font-normal leading-tight tracking-[-.02em] text-ink">
        {doc.title || doc.fileName}
      </h2>
      <p className="mt-1 text-[13px] text-ink-3 tabular">
        {[
          doc.documentDate && formatDate(doc.documentDate, 'd MMM yyyy'),
          doc.createdAt && `added ${formatDate(doc.createdAt, 'd MMM yyyy')}`,
          formatBytes(doc.size),
          doc.source === 'camera' && 'photo',
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>

      <div className="mt-5">
        <DocumentPreview storagePath={doc.storagePath} contentType={doc.contentType} title={doc.title || doc.fileName} />
      </div>

      {doc.labRecordId && (
        <p className="mt-5 text-sm text-ink-2">
          Values saved as{' '}
          <Link href={`/records/${doc.labRecordId}`} className="tlink">
            {record ? `the ${formatDate(record.recordDate, 'd MMM yyyy')} record` : 'a lab record'}
          </Link>
          .
        </p>
      )}

      {canExtract && (
        <Button className="mt-5 w-full" onClick={() => setExtracting(true)}>
          <ScanText className="h-4 w-4" aria-hidden /> Extract values
        </Button>
      )}

      {canEdit && !editing && (
        <div className="mt-6 flex flex-wrap gap-3 border-t border-hair-2 pt-5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setForm({ kind: doc.kind, title: doc.title || '', documentDate: doc.documentDate || '' })
              setEditing(true)
            }}
          >
            Edit details
          </Button>
          <Button variant="danger" size="sm" loading={busy} onClick={handleDelete}>Delete</Button>
        </div>
      )}

      {editing && (
        <div className="mt-6 space-y-3 border-t border-hair-2 pt-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-kind" className="label mb-1.5 block text-ink-3">Kind</label>
              <select id="edit-kind" className="field" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as DocumentKind })}>
                {DOCUMENT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="edit-date" className="label mb-1.5 block text-ink-3">Date</label>
              <input id="edit-date" type="date" className="field tabular" value={form.documentDate} onChange={(e) => setForm({ ...form, documentDate: e.target.value })} />
            </div>
          </div>
          <div>
            <label htmlFor="edit-title" className="label mb-1.5 block text-ink-3">Title</label>
            <input id="edit-title" className="field" maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setEditing(false)}>Cancel</Button>
            <Button className="flex-[2]" loading={busy} onClick={saveMeta}>Save</Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-critical">{error}</p>}
    </>
  )
}

export default function DocumentPage() {
  return (
    <>
      <Header title="Document" showBack />
      <main className="px-4 py-5">
        <Suspense fallback={<ListSkeleton rows={3} />}>
          <DocumentDetail />
        </Suspense>
      </main>
    </>
  )
}
