'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { Header, primaryIconButton, iconButton } from '@/components/layout/header'
import { usePatient, useCanEdit } from '@/components/providers/patient-provider'
import { Badge } from '@/components/ui/badge'
import { interactiveCard } from '@/components/ui/card'
import { ListSkeleton } from '@/components/ui/skeleton'
import { Tabs } from '@/components/ui/tabs'
import { DOCUMENT_KINDS, DocIcon, KIND_LABEL, formatBytes, useDocuments } from '@/components/documents/shared'
import { UploadPanel } from '@/components/documents/upload-panel'
import { formatDate, cn } from '@/lib/utils'

export default function DocumentsPage() {
  const router = useRouter()
  const { pid } = usePatient()
  const canEdit = useCanEdit()
  const { documents, loading, error } = useDocuments()
  const [filter, setFilter] = useState<string>('all')
  const [showUpload, setShowUpload] = useState(false)

  const shown = filter === 'all' ? documents : documents.filter((d) => d.kind === filter)

  return (
    <>
      <Header
        title="Documents"
        emphasis="Documents"
        actions={
          canEdit ? (
            <button
              type="button"
              onClick={() => setShowUpload((s) => !s)}
              aria-label={showUpload ? 'Close upload' : 'Add document'}
              aria-expanded={showUpload}
              className={showUpload ? iconButton : primaryIconButton}
            >
              {showUpload ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            </button>
          ) : undefined
        }
      />
      <main className="px-4 py-5">
        {canEdit && showUpload && pid && (
          <div className="mb-6">
            <UploadPanel
              pid={pid}
              onUploaded={(docId, kind) => {
                setShowUpload(false)
                router.push(`/documents/${docId}${kind === 'lab-report' ? '?extract=1' : ''}`)
              }}
            />
          </div>
        )}

        <Tabs
          className="mb-4"
          activeTab={filter}
          onTabChange={setFilter}
          tabs={[{ id: 'all', label: 'All' }, ...DOCUMENT_KINDS.map((k) => ({ id: k.id, label: k.label }))]}
        />

        {loading ? (
          <ListSkeleton rows={4} />
        ) : error ? (
          <p role="alert" className="pt-12 text-center text-[15px] text-critical">{error}</p>
        ) : shown.length === 0 ? (
          <div className="pt-12 text-center">
            <p className="font-serif text-xl text-ink">{documents.length === 0 ? 'No documents yet' : 'Nothing here'}</p>
            <p className="mx-auto mt-2 max-w-[34ch] text-[15px] text-ink-2">
              {canEdit
                ? 'Keep lab reports, prescriptions and discharge summaries in one place. Tap + to add a PDF or a photo.'
                : 'Documents added by the care circle will appear here.'}
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {shown.map((d) => (
              <li key={d.id}>
                <Link href={`/documents/${d.id}`} className={cn('flex h-full flex-col rounded-card border border-hair bg-vellum p-3.5', interactiveCard)}>
                  <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-recess text-terra-dk">
                    <DocIcon contentType={d.contentType} className="h-5 w-5" />
                  </span>
                  <span className="line-clamp-2 text-sm font-semibold leading-snug text-ink">{d.title || d.fileName}</span>
                  <span className="mt-1 text-xs text-ink-3 tabular">
                    {KIND_LABEL[d.kind] ?? 'Document'}
                    {d.documentDate ? ` · ${formatDate(d.documentDate, 'd MMM yy')}` : d.createdAt ? ` · ${formatDate(d.createdAt, 'd MMM yy')}` : ''}
                  </span>
                  <span className="mt-auto flex items-center gap-1.5 pt-2">
                    {d.labRecordId && <Badge variant="good">Values saved</Badge>}
                    <span className="text-[11px] text-ink-3">{formatBytes(d.size)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  )
}
