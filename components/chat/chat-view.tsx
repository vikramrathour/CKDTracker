'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronRight, SquarePen, Trash2, TriangleAlert, WifiOff } from 'lucide-react'
import { Header, iconButton } from '@/components/layout/header'
import { useAuth } from '@/components/providers/auth-provider'
import { useCanEdit, usePatient } from '@/components/providers/patient-provider'
import { useToast } from '@/components/providers/toast-provider'
import { ListSkeleton } from '@/components/ui/skeleton'
import { deleteChatThread, subscribeChatMessages, subscribeChatThreads, type ChatMessageView } from '@/lib/firebase/chat'
import { cn, formatDate } from '@/lib/utils'
import type { ChatThread } from '@/lib/types/care'
import type { ChartPayload } from '@/lib/server/chat/events'
import { Composer, MAX_CHARS } from './composer'
import { MessageBubble, type BubbleMessage } from './message-bubble'
import { ChatRequestError, streamChat } from './stream-chat'

export const STARTER_PROMPTS = [
  'What changed since my last visit?',
  'Help me prepare for my next appointment',
  'Why might my potassium be high?',
  'Explain my tacrolimus levels',
]

interface Pending {
  userText: string
  userMessageId?: string
  text: string
  charts: ChartPayload[]
  proposals: string[]
  doneMessageId?: string
}

interface ChatError {
  message: string
  code?: string
}

function useOnline(): boolean {
  const [online, setOnline] = useState(true)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

export function ChatView() {
  const router = useRouter()
  const params = useSearchParams()
  const threadId = params.get('id')
  const prefill = params.get('q')

  const { user } = useAuth()
  const { pid, records } = usePatient()
  const canEdit = useCanEdit()
  const { showToast } = useToast()
  const online = useOnline()

  const [threads, setThreads] = useState<ChatThread[] | null>(null)
  const [messages, setMessages] = useState<ChatMessageView[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [draft, setDraft] = useState(prefill ? prefill.slice(0, MAX_CHARS) : '')
  const [pending, setPending] = useState<Pending | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<ChatError | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Threads: the caller's own, for the active patient.
  useEffect(() => {
    setThreads(null)
    if (!pid || !user) return
    return subscribeChatThreads(pid, user.uid, setThreads, () => setThreads([]))
  }, [pid, user])

  // Messages of the open thread.
  useEffect(() => {
    setMessages([])
    if (!pid || !threadId) return
    setMessagesLoading(true)
    return subscribeChatMessages(
      pid,
      threadId,
      (m) => {
        setMessages(m)
        setMessagesLoading(false)
      },
      () => {
        setMessagesLoading(false)
        setError({ message: 'This chat could not be loaded.' })
      }
    )
  }, [pid, threadId])

  // Drop the optimistic answer once the saved copy arrives.
  useEffect(() => {
    if (pending?.doneMessageId && messages.some((m) => m.id === pending.doneMessageId)) setPending(null)
  }, [messages, pending?.doneMessageId])

  useEffect(() => () => abortRef.current?.abort(), [])

  // Switching threads (or "New chat") clears leftovers from the previous one,
  // but not while a new thread's first answer is streaming in.
  const sendingRef = useRef(false)
  sendingRef.current = sending
  useEffect(() => {
    if (!sendingRef.current) {
      setPending(null)
      setError(null)
    }
  }, [threadId])

  // A new ?q= (e.g. from the alerts banner) refills the composer.
  useEffect(() => {
    if (prefill) setDraft(prefill.slice(0, MAX_CHARS))
  }, [prefill])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [messages.length, pending?.text.length, pending?.charts.length, pending?.proposals.length])

  const recordIdByDate = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of records) m.set(r.recordDate.slice(0, 10), r.id)
    return m
  }, [records])
  const recordIdForDate = useCallback((d: string) => recordIdByDate.get(d) ?? null, [recordIdByDate])

  const send = useCallback(
    async (text: string) => {
      const message = text.trim()
      if (!pid || !message || sending) return
      setError(null)
      setSending(true)
      setDraft('')
      setPending({ userText: message, text: '', charts: [], proposals: [] })
      let started = false
      const controller = new AbortController()
      abortRef.current = controller
      try {
        await streamChat({
          pid,
          chatId: threadId,
          message,
          signal: controller.signal,
          onEvent: (e) => {
            switch (e.event) {
              case 'meta':
                started = true
                setPending((p) => (p ? { ...p, userMessageId: e.data.userMessageId } : p))
                if (e.data.chatId !== threadId) router.replace(`/chat?id=${encodeURIComponent(e.data.chatId)}`, { scroll: false })
                break
              case 'delta':
                setPending((p) => (p ? { ...p, text: p.text + e.data.text } : p))
                break
              case 'chart':
                setPending((p) => (p ? { ...p, charts: [...p.charts, e.data] } : p))
                break
              case 'proposal':
                setPending((p) => (p ? { ...p, proposals: [...p.proposals, e.data.text] } : p))
                break
              case 'done':
                setPending((p) => (p ? { ...p, doneMessageId: e.data.messageId } : p))
                break
              case 'error':
                setError({ message: e.data.message, code: e.data.code })
                setPending(null)
                break
            }
          },
        })
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return
        setError(
          err instanceof ChatRequestError
            ? { message: err.message, code: err.status === 429 ? 'usage_limit' : err.code }
            : { message: 'Something went wrong. Please try again.' }
        )
        setPending(null)
        // Nothing reached the server: give the text back.
        if (!started) setDraft(message)
      } finally {
        setSending(false)
        abortRef.current = null
      }
    },
    [pid, sending, threadId, router]
  )

  const removeThread = async (id: string) => {
    if (!pid || !confirm('Delete this chat? This cannot be undone.')) return
    try {
      await deleteChatThread(pid, id)
      if (id === threadId) router.replace('/chat')
    } catch {
      showToast('error', 'Could not delete the chat. Please try again.')
    }
  }

  const bubbles: BubbleMessage[] = messages.map((m) => ({
    key: m.id,
    role: m.role,
    text: m.text,
    charts: m.charts,
    proposals: m.proposals,
    citationMap: m.citationMap,
  }))
  if (pending) {
    if (!pending.userMessageId || !messages.some((m) => m.id === pending.userMessageId)) {
      bubbles.push({ key: 'pending-user', role: 'user', text: pending.userText })
    }
    bubbles.push({
      key: 'pending-model',
      role: 'model',
      text: pending.text,
      charts: pending.charts,
      proposals: pending.proposals,
      streaming: !pending.doneMessageId,
    })
  }

  const activeThread = threads?.find((t) => t.id === threadId)
  const showIntro = !threadId && !pending

  return (
    <>
      <Header
        title={threadId ? activeThread?.title || 'Chat' : 'Ask your reports'}
        emphasis={threadId ? undefined : 'reports'}
        actions={
          threadId || pending ? (
            <button type="button" onClick={() => router.push('/chat')} aria-label="New chat" className={iconButton}>
              <SquarePen className="h-5 w-5" />
            </button>
          ) : undefined
        }
      />

      <main className="flex min-h-[calc(100vh-4rem-5.5rem)] flex-col px-4 pt-4">
        {showIntro ? (
          <section className="animate-fade-up">
            <p className="eyebrow">Chat with your reports</p>
            <h2 className="mt-2 font-serif text-[1.75rem] font-normal leading-tight tracking-[-.02em] text-ink">
              Ask about results, <em className="italic text-terra-dk">trends</em> and what to raise with the doctor.
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-3">
              Answers use only the reports, medicines and visits saved here, with links to each report.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={!online || sending}
                  onClick={() => send(p)}
                  className="group flex min-h-[48px] items-center justify-between gap-3 rounded-card border border-hair bg-vellum px-4 py-3 text-left text-[15px] text-ink transition-[border-color,box-shadow] duration-300 ease-editorial hover:border-hair-hot hover:shadow-lift disabled:opacity-50"
                >
                  {p}
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-3 group-hover:text-terra" aria-hidden />
                </button>
              ))}
            </div>

            <h3 className="mt-8 font-serif text-lg font-medium text-ink">Recent chats</h3>
            {threads === null ? (
              <div className="mt-3">
                <ListSkeleton rows={3} />
              </div>
            ) : threads.length === 0 ? (
              <p className="mt-2 text-[14px] text-ink-3">No chats yet. Chats are private to you.</p>
            ) : (
              <ul className="mt-2 border-t border-hair-2">
                {threads.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 border-b border-hair-2">
                    <button
                      type="button"
                      onClick={() => router.push(`/chat?id=${encodeURIComponent(t.id)}`)}
                      className="min-w-0 flex-1 py-3 text-left"
                    >
                      <span className="block truncate text-[15px] font-medium text-ink">{t.title}</span>
                      {t.updatedAt && (
                        <span className="text-[12px] text-ink-3 tabular">{formatDate(t.updatedAt, 'd MMM yyyy, HH:mm')}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeThread(t.id)}
                      aria-label={`Delete chat “${t.title}”`}
                      className="-mr-2 flex h-10 w-10 items-center justify-center rounded-btn text-ink-3 transition-colors hover:bg-critical-pale hover:text-critical"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <section aria-live="polite" aria-busy={sending} className="flex flex-col gap-3 pb-2">
            {messagesLoading && bubbles.length === 0 ? (
              <ListSkeleton rows={3} />
            ) : (
              bubbles.map((b) => (
                <MessageBubble key={b.key} message={b} pid={pid ?? ''} canEdit={canEdit} recordIdForDate={recordIdForDate} />
              ))
            )}
            {threadId && !sending && activeThread && (
              <button
                type="button"
                onClick={() => removeThread(threadId)}
                className="self-center text-[12px] font-medium text-ink-3 underline-offset-2 hover:text-critical hover:underline"
              >
                Delete this chat
              </button>
            )}
          </section>
        )}

        <div ref={endRef} />

        <div className="glass sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 -mx-4 mt-auto border-t border-hair px-4 pb-2 pt-3">
          {(error || !online) && (
            <div
              role="alert"
              className={cn(
                'mb-2.5 flex items-start gap-2 rounded-card border px-3 py-2 text-[13px] leading-snug',
                !online || error?.code === 'offline'
                  ? 'border-hair-2 bg-recess text-ink-2'
                  : 'border-terra/40 bg-terra-pale text-terra-dk'
              )}
            >
              {!online || error?.code === 'offline' ? (
                <WifiOff className="mt-px h-4 w-4 flex-shrink-0" aria-hidden />
              ) : (
                <TriangleAlert className="mt-px h-4 w-4 flex-shrink-0" aria-hidden />
              )}
              <span>{!online ? "You're offline. Chat needs a connection; your reports are still available." : error?.message}</span>
            </div>
          )}
          <Composer
            value={draft}
            onChange={setDraft}
            onSend={() => send(draft)}
            sending={sending}
            disabled={!pid || !online}
          />
          <p id="chat-footnote" className="mt-1.5 flex justify-between gap-3 text-[11px] leading-snug text-ink-3">
            <span>Not medical advice — confirm with your transplant team.</span>
            {draft.length > MAX_CHARS - 200 && (
              <span className={cn('tabular', draft.length > MAX_CHARS && 'font-semibold text-critical')}>
                {draft.length}/{MAX_CHARS}
              </span>
            )}
          </p>
        </div>
      </main>
    </>
  )
}
