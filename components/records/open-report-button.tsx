'use client'

import { useState } from 'react'
import { ExternalLink, FileText, Loader2 } from 'lucide-react'
import { getDocumentUrl } from '@/lib/firebase/storage'
import { cn } from '@/lib/utils'

/**
 * Opens a record's original report (the vault file in `pdfPath`) in a new
 * tab. The download URL comes from the client SDK, so storage.rules decide
 * access. Renders nothing for records without a file (entered by hand, or
 * migrated from the old app, which never stored files).
 *
 * The tab is opened synchronously and pointed at the URL once it resolves:
 * mobile browsers block window.open() after an await.
 */
export function OpenReportButton({
  pdfPath,
  variant = 'button',
  label = 'Open original report',
  className,
}: {
  pdfPath: string | null | undefined
  variant?: 'button' | 'link' | 'icon'
  label?: string
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  if (!pdfPath) return null

  const open = async () => {
    setFailed(false)
    setBusy(true)
    const win = window.open('', '_blank')
    try {
      const url = await getDocumentUrl(pdfPath)
      if (win) win.location.href = url
      else window.location.href = url
    } catch (err) {
      console.warn('Opening the report failed:', err)
      win?.close()
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const icon = busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileText className="h-4 w-4" aria-hidden />

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={open}
        aria-label={label}
        title={failed ? 'The file could not be opened' : label}
        className={cn(
          'inline-flex h-11 w-11 items-center justify-center rounded-btn text-ink-3 transition-colors hover:bg-wash hover:text-ink',
          failed && 'text-critical',
          className
        )}
      >
        {icon}
      </button>
    )
  }

  if (variant === 'link') {
    return (
      <button type="button" onClick={open} className={cn('tlink inline-flex items-center gap-1.5 text-[13px]', className)}>
        {icon}
        {failed ? 'Could not open the file' : label}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={open}
      className={cn(
        'flex min-h-[44px] w-full items-center gap-3 rounded-card border border-hair bg-vellum px-3.5 py-2.5 text-left transition-colors hover:border-hair-hot',
        className
      )}
    >
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-recess text-terra-dk">{icon}</span>
      <span className="flex-1 text-sm font-semibold text-ink">{failed ? 'The file could not be opened' : label}</span>
      <ExternalLink className="h-4 w-4 text-ink-3" aria-hidden />
    </button>
  )
}
