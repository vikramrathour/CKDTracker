'use client'

import { useEffect, useRef } from 'react'
import { ArrowUp, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export const MAX_CHARS = 2000

interface Props {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  sending: boolean
  disabled?: boolean
  placeholder?: string
}

export function Composer({ value, onChange, onSend, sending, disabled, placeholder }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Grow with content up to ~6 lines.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    // scrollHeight excludes the border; add it back or a scrollbar appears.
    el.style.height = `${Math.min(el.scrollHeight + el.offsetHeight - el.clientHeight, 160)}px`
  }, [value])

  const trimmed = value.trim()
  const tooLong = value.length > MAX_CHARS
  const canSend = !!trimmed && !tooLong && !sending && !disabled

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (canSend) onSend()
      }}
      className="flex items-end gap-2"
    >
      <label htmlFor="chat-input" className="sr-only">
        Ask about the reports
      </label>
      <textarea
        id="chat-input"
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            if (canSend) onSend()
          }
        }}
        placeholder={placeholder ?? 'Ask about the reports…'}
        disabled={disabled}
        className="field min-h-[44px] resize-none py-[11px] text-[15px] leading-snug"
        aria-describedby="chat-footnote"
      />
      <button
        type="submit"
        disabled={!canSend}
        aria-label="Send"
        className={cn(
          'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-btn bg-ink text-canvas',
          'transition-[background-color,transform,opacity] duration-200 ease-editorial hover:bg-ink-hover hover:-translate-y-px',
          'disabled:pointer-events-none disabled:opacity-40'
        )}
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowUp className="h-5 w-5" aria-hidden />}
      </button>
    </form>
  )
}
