'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { visitWhen } from '@/components/visits/visit-card'
import { deleteQuestion, setQuestionStatus, updateQuestionText } from '@/lib/firebase/questions'
import { formatDate } from '@/lib/utils'
import type { Question } from '@/lib/types/care'
import type { VisitRecord } from '@/lib/visits/types'

export const QUESTION_STATUS_VARIANT = { open: 'warning', asked: 'info', answered: 'good' } as const

export function VisitSelect({
  id,
  visits,
  value,
  onChange,
}: {
  id: string
  visits: VisitRecord[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No visit</option>
      {visits.map((v) => (
        <option key={v.id} value={v.id}>
          {visitWhen(v, 'd MMM yyyy')}
          {v.doctorName ? ` · ${v.doctorName}` : ''}
        </option>
      ))}
    </select>
  )
}

interface Props {
  pid: string
  question: Question
  visits: VisitRecord[]
  canEdit: boolean
  /** Visit to suggest when answering (e.g. the most recent past/today visit). */
  defaultVisitId?: string
}

export function QuestionItem({ pid, question: q, visits, canEdit, defaultVisitId }: Props) {
  const [mode, setMode] = useState<'answer' | 'edit' | null>(null)
  const [text, setText] = useState(q.text)
  const [answer, setAnswer] = useState(q.answer ?? '')
  const [visitId, setVisitId] = useState(q.visitId ?? defaultVisitId ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const visit = visits.find((v) => v.id === q.visitId)

  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setMode(null)
    } catch (err) {
      console.error('Question update failed:', err)
      setError('Could not save. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const open = (m: 'answer' | 'edit') => {
    setText(q.text)
    setAnswer(q.answer ?? '')
    setVisitId(q.visitId ?? defaultVisitId ?? '')
    setError(null)
    setMode(m)
  }

  return (
    <li className="border-b border-hair-2 py-3.5">
      <div className="flex items-start gap-2">
        <p className="flex-1 whitespace-pre-wrap text-[15px] text-ink">{q.text}</p>
        <div className="flex flex-shrink-0 items-center gap-1">
          {q.source === 'chat' && (
            <Badge variant="neutral" className="gap-1" >
              <Sparkles className="h-3 w-3" aria-hidden /> From chat
            </Badge>
          )}
          <Badge variant={QUESTION_STATUS_VARIANT[q.status]}>{q.status}</Badge>
        </div>
      </div>

      {q.answer && q.status === 'answered' && (
        <p className="mt-2 whitespace-pre-wrap border-l-2 border-sage pl-3 text-sm text-ink-2">{q.answer}</p>
      )}

      <p className="mt-1.5 text-xs text-ink-3 tabular">
        {visit ? (
          <Link href={`/visits/${visit.id}`} className="underline decoration-hair-2 underline-offset-2 hover:text-ink">
            {q.status === 'answered' ? 'Answered at' : 'For'} visit {visitWhen(visit, 'd MMM yyyy')}
          </Link>
        ) : (
          'Not linked to a visit'
        )}
        {q.answeredAt && ` · answered ${formatDate(q.answeredAt, 'd MMM yyyy')}`}
      </p>

      {canEdit && (
        <div className="mt-2 flex flex-wrap gap-2">
          {q.status === 'open' && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(() => setQuestionStatus(pid, q.id, 'asked'))}>
              Mark asked
            </Button>
          )}
          {q.status !== 'answered' && (
            <Button size="sm" variant="terra" disabled={busy} onClick={() => open('answer')}>Record answer</Button>
          )}
          {q.status !== 'open' && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => setQuestionStatus(pid, q.id, 'open'))}>
              Reopen
            </Button>
          )}
          {q.status === 'answered' && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => open('answer')}>Edit answer</Button>
          )}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => open('edit')}>Edit</Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            className="hover:text-critical"
            onClick={() => confirm('Delete this question?') && act(() => deleteQuestion(pid, q.id))}
          >
            Delete
          </Button>
        </div>
      )}
      {error && mode === null && <p role="alert" className="mt-1 text-xs text-critical">{error}</p>}

      <Modal open={mode === 'answer'} onClose={() => setMode(null)} title="Doctor’s answer">
        <p className="mb-3 text-sm text-ink-2">{q.text}</p>
        <label htmlFor={`ans-${q.id}`} className="label mb-1.5 block text-ink-3">Answer</label>
        <textarea id={`ans-${q.id}`} rows={4} className="field" value={answer} onChange={(e) => setAnswer(e.target.value)} autoFocus />
        <label htmlFor={`ans-v-${q.id}`} className="label mb-1.5 mt-4 block text-ink-3">At visit</label>
        <VisitSelect id={`ans-v-${q.id}`} visits={visits} value={visitId} onChange={setVisitId} />
        {error && <p role="alert" className="mt-2 text-sm text-critical">{error}</p>}
        <div className="mt-5 flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setMode(null)}>Cancel</Button>
          <Button
            className="flex-[2]"
            loading={busy}
            disabled={!answer.trim()}
            onClick={() => act(() => setQuestionStatus(pid, q.id, 'answered', { answer, visitId: visitId || null }))}
          >
            Save answer
          </Button>
        </div>
      </Modal>

      <Modal open={mode === 'edit'} onClose={() => setMode(null)} title="Edit question">
        <label htmlFor={`q-${q.id}`} className="label mb-1.5 block text-ink-3">Question</label>
        <textarea id={`q-${q.id}`} rows={3} className="field" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        <label htmlFor={`q-v-${q.id}`} className="label mb-1.5 mt-4 block text-ink-3">Visit</label>
        <VisitSelect id={`q-v-${q.id}`} visits={visits} value={visitId} onChange={setVisitId} />
        {error && <p role="alert" className="mt-2 text-sm text-critical">{error}</p>}
        <div className="mt-5 flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setMode(null)}>Cancel</Button>
          <Button
            className="flex-[2]"
            loading={busy}
            disabled={!text.trim()}
            onClick={() => act(() => updateQuestionText(pid, q.id, text, visitId || null))}
          >
            Save
          </Button>
        </div>
      </Modal>
    </li>
  )
}
