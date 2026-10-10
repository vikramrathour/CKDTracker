'use client'

import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { getDocumentUrl } from '@/lib/firebase/storage'
import { DocIcon } from './shared'

/**
 * Inline preview of a vault file (download URL from the client SDK, so
 * storage.rules decide access). Images render inline; PDFs open in a new tab
 * (mobile browsers don't render PDFs in iframes reliably).
 */
export function DocumentPreview({ storagePath, contentType, title }: { storagePath: string; contentType: string; title: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setUrl(null)
    setError(false)
    getDocumentUrl(storagePath)
      .then((u) => !cancelled && setUrl(u))
      .catch((err) => {
        console.warn('Document URL failed:', err)
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [storagePath])

  if (error) return <p className="text-sm text-critical">The file could not be opened. It may have been deleted.</p>
  if (!url) return <div className="h-40 animate-pulse rounded-card bg-recess" aria-label="Loading preview" />

  const isImage = contentType.startsWith('image/') && contentType !== 'image/heic'
  return (
    <div>
      {isImage ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-card border border-hair bg-recess">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, not optimisable */}
          <img src={url} alt={title} className="max-h-[60vh] w-full object-contain" />
        </a>
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-card border border-hair bg-vellum p-4 transition-colors hover:border-hair-hot"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-recess text-terra-dk">
            <DocIcon contentType={contentType} className="h-5 w-5" />
          </span>
          <span className="flex-1 text-sm font-semibold text-ink">Open {contentType === 'application/pdf' ? 'PDF' : 'file'}</span>
          <ExternalLink className="h-4 w-4 text-ink-3" aria-hidden />
        </a>
      )}
    </div>
  )
}
