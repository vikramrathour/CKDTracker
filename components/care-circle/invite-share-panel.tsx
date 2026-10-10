'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, MessageCircle, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/providers/toast-provider'
import { formatPhoneForDisplay } from '@/lib/phone'
import type { Role } from '@/lib/types/member'
import { buildInviteMessage, whatsappUrl } from './share'

interface InviteSharePanelProps {
  url: string
  patientName: string
  role: Role
  phoneE164?: string | null
  inviteeName?: string | null
  expiresAt?: string | null
}

/** The invite link with WhatsApp, copy and (where supported) the system share sheet. */
export function InviteSharePanel({ url, patientName, role, phoneE164, inviteeName, expiresAt }: InviteSharePanelProps) {
  const { showToast } = useToast()
  const [copied, setCopied] = useState(false)
  const [canShare, setCanShare] = useState(false)
  const message = buildInviteMessage({ patientName, role, url, inviteeName })

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast('error', 'Couldn’t copy. Press and hold the link to copy it.')
    }
  }

  async function share() {
    try {
      await navigator.share({ title: 'Join my care circle', text: message, url })
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') showToast('error', 'Sharing failed. Copy the link instead.')
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">
        Send this link to {inviteeName || formatPhoneForDisplay(phoneE164) || 'them'}. They sign in with that phone number to join
        {expiresAt ? ` (valid until ${new Date(expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})` : ''}.
      </p>
      <div className="flex items-center gap-2 rounded-btn border border-hair bg-recess px-3 py-2.5">
        <span className="min-w-0 flex-1 select-all truncate text-[13px] tabular text-ink" title={url}>{url}</span>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy invite link"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-btn text-ink-2 transition-colors hover:bg-wash hover:text-ink"
        >
          {copied ? <Check className="h-4 w-4 text-sage" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <a
          href={whatsappUrl(message, phoneE164)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-btn border-[1.5px] border-ink bg-ink px-[1.4rem] text-sm font-semibold text-canvas transition-[background-color,transform] duration-200 ease-editorial hover:-translate-y-px hover:bg-ink-hover"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          Share on WhatsApp
        </a>
        {canShare ? (
          <Button variant="secondary" className="flex-1" onClick={share}>
            <Share2 className="h-4 w-4" aria-hidden />
            More options
          </Button>
        ) : (
          <Button variant="secondary" className="flex-1" onClick={copy}>
            <Copy className="h-4 w-4" aria-hidden />
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        )}
      </div>
    </div>
  )
}
