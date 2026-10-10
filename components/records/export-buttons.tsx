'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { downloadBlob, fileNameFrom } from '@/components/visits/prep-pdf-actions'
import { apiFetch } from '@/lib/api/client'

/** CSV (lab values) and full JSON export via GET /api/export. Any member. */
export function ExportButtons({ pid }: { pid: string }) {
  const [busy, setBusy] = useState<'csv' | 'json' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (format: 'csv' | 'json') => {
    setBusy(format)
    setError(null)
    try {
      const res = await apiFetch(`/api/export?pid=${encodeURIComponent(pid)}&format=${format}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Export failed')
      }
      downloadBlob(await res.blob(), fileNameFrom(res, `export.${format}`))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" size="sm" loading={busy === 'csv'} disabled={busy !== null} onClick={() => run('csv')}>
          <Download className="h-4 w-4" aria-hidden /> Lab values (CSV)
        </Button>
        <Button variant="secondary" size="sm" loading={busy === 'json'} disabled={busy !== null} onClick={() => run('json')}>
          <Download className="h-4 w-4" aria-hidden /> All data (JSON)
        </Button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-critical">{error}</p>}
    </div>
  )
}
