'use client'

import { useEffect, useState } from 'react'
import { Download, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api/client'

/** Save a Blob as a file via a temporary object URL. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Filename from Content-Disposition, or the fallback. */
export function fileNameFrom(res: Response, fallback: string): string {
  const cd = res.headers.get('content-disposition') || ''
  const m = cd.match(/filename="([^"]+)"/)
  return m?.[1] || fallback
}

/**
 * Download or share the server-rendered visit-prep PDF
 * (GET /api/visits/{id}/prep-pdf). Share uses the Web Share API with a file
 * (WhatsApp, email…) where supported, else falls back to a download.
 */
export function PrepPdfActions({ pid, visitId, visitDate }: { pid: string; visitId: string; visitDate: string }) {
  const [busy, setBusy] = useState<'download' | 'share' | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Decided after mount so server and client render the same markup.
  const [canShareFiles, setCanShareFiles] = useState(false)
  useEffect(() => setCanShareFiles(typeof navigator.canShare === 'function'), [])

  const fetchPdf = async (): Promise<File> => {
    const res = await apiFetch(`/api/visits/${encodeURIComponent(visitId)}/prep-pdf?pid=${encodeURIComponent(pid)}`)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Could not create the PDF')
    }
    const blob = await res.blob()
    return new File([blob], fileNameFrom(res, `visit-prep-${visitDate}.pdf`), { type: 'application/pdf' })
  }

  const run = async (mode: 'download' | 'share') => {
    setBusy(mode)
    setError(null)
    try {
      const file = await fetchPdf()
      if (mode === 'share' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Visit summary' })
        } catch (err) {
          const name = (err as DOMException)?.name
          // NotAllowedError: the tap's user activation expired while the PDF rendered.
          if (name === 'NotAllowedError') downloadBlob(file, file.name)
          else if (name !== 'AbortError') throw err
        }
      } else {
        downloadBlob(file, file.name)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the PDF')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" loading={busy === 'download'} disabled={busy !== null} onClick={() => run('download')}>
          <Download className="h-4 w-4" aria-hidden /> PDF
        </Button>
        {canShareFiles && (
          <Button variant="terra" loading={busy === 'share'} disabled={busy !== null} onClick={() => run('share')}>
            <Share2 className="h-4 w-4" aria-hidden /> Share
          </Button>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-critical">{error}</p>}
    </div>
  )
}
