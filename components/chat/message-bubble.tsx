'use client'

import { useState } from 'react'
import { Check, Loader2, MessageSquarePlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { addQuestionFromChat } from '@/lib/firebase/chat'
import { useToast } from '@/components/providers/toast-provider'
import type { ChartPayload } from '@/lib/server/chat/events'
import { MarkdownLite } from './markdown-lite'
import { MiniTrend } from './mini-trend'

export interface BubbleMessage {
  key: string
  role: 'user' | 'model'
  text: string
  charts?: ChartPayload[]
  proposals?: string[]
  citationMap?: Record<string, string[]>
  streaming?: boolean
}

interface Props {
  message: BubbleMessage
  pid: string
  canEdit: boolean
  /** Fallback date → recordId lookup from the patient's records. */
  recordIdForDate: (date: string) => string | null
}

export function MessageBubble({ message, pid, canEdit, recordIdForDate }: Props) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-card rounded-br-sm bg-ink px-3.5 py-2.5 text-[15px] leading-relaxed text-canvas">
          {message.text}
        </div>
      </div>
    )
  }

  const citationHref = (date: string) => {
    const id = message.citationMap?.[date]?.[0] ?? recordIdForDate(date)
    return id ? `/records/${encodeURIComponent(id)}` : null
  }

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[92%] space-y-3 rounded-card rounded-bl-sm border border-hair bg-vellum px-3.5 py-3 text-[15px] leading-relaxed text-ink-2 shadow-soft">
        {message.text ? (
          <MarkdownLite text={message.text} citationHref={citationHref} />
        ) : (
          message.streaming && (
            <p className="flex items-center gap-2 text-ink-3">
              <span className="pulse-dot" aria-hidden /> Looking through the reports…
            </p>
          )
        )}
        {message.charts?.map((c, i) => <MiniTrend key={`${c.testName}-${i}`} chart={c} />)}
        {message.proposals && message.proposals.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-hair pt-3">
            {message.proposals.map((p) => (
              <ProposalChip key={p} text={p} pid={pid} canEdit={canEdit} />
            ))}
          </div>
        )}
        {message.streaming && message.text && <span className="sr-only">Answer still arriving</span>}
      </div>
    </div>
  )
}

function ProposalChip({ text, pid, canEdit }: { text: string; pid: string; canEdit: boolean }) {
  const { showToast } = useToast()
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')

  const add = async () => {
    if (!canEdit || state !== 'idle') return
    setState('saving')
    try {
      await addQuestionFromChat(pid, text)
      setState('saved')
      showToast('success', "Added to the doctor's questions")
    } catch {
      setState('idle')
      showToast('error', 'Could not save the question. Please try again.')
    }
  }

  return (
    <div className="rounded-card border border-hair-2 bg-canvas px-3 py-2.5">
      <p className="text-[11px] font-bold uppercase tracking-[.08em] text-terra-dk">Question for the doctor</p>
      <p className="mt-1 text-[14px] leading-snug text-ink">{text}</p>
      <button
        type="button"
        onClick={add}
        disabled={!canEdit || state !== 'idle'}
        title={canEdit ? undefined : 'Only the owner or an editor can add questions'}
        className={cn(
          'mt-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-btn border-[1.5px] px-3 text-[13px] font-semibold transition-colors duration-200',
          state === 'saved'
            ? 'border-sage/40 bg-sage-pale text-sage'
            : 'border-terra text-terra-dk hover:bg-terra-pale disabled:cursor-not-allowed disabled:opacity-50'
        )}
      >
        {state === 'saving' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : state === 'saved' ? (
          <Check className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
        )}
        {state === 'saved' ? 'Added' : canEdit ? "Add to doctor's questions" : 'View only'}
      </button>
    </div>
  )
}
