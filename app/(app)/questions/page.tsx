'use client'

import { useMemo, useState } from 'react'
import { Header } from '@/components/layout/header'
import { usePatient, useCanEdit } from '@/components/providers/patient-provider'
import { Button } from '@/components/ui/button'
import { ListSkeleton } from '@/components/ui/skeleton'
import { Tabs } from '@/components/ui/tabs'
import { QuestionItem, VisitSelect } from '@/components/questions/question-item'
import { useQuestions, useVisits } from '@/components/visits/hooks'
import { addQuestion } from '@/lib/firebase/questions'
import { splitVisits, todayYmd } from '@/lib/visits/types'
import type { QuestionStatus } from '@/lib/types/care'

type Filter = QuestionStatus | 'all'

export default function QuestionsPage() {
  const { pid } = usePatient()
  const canEdit = useCanEdit()
  const { questions, loading, error } = useQuestions()
  const { visits } = useVisits()
  const [filter, setFilter] = useState<Filter>('open')
  const [text, setText] = useState('')
  const [visitId, setVisitId] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const { upcoming, past } = useMemo(() => splitVisits(visits), [visits])
  // Visits for pickers: upcoming soonest first, then past newest first.
  const visitOptions = useMemo(() => [...upcoming, ...past], [upcoming, past])
  // When answering, suggest today's visit or the latest past one.
  const today = todayYmd()
  const answerDefault = upcoming.find((v) => v.visitDate === today)?.id ?? past[0]?.id

  const counts = useMemo(() => {
    const c = { open: 0, asked: 0, answered: 0 }
    for (const q of questions) c[q.status]++
    return c
  }, [questions])

  const shown = filter === 'all' ? questions : questions.filter((q) => q.status === filter)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pid || !text.trim()) return
    setAdding(true)
    setAddError(null)
    try {
      await addQuestion(pid, text, { visitId: visitId || null })
      setText('')
      setFilter('open')
    } catch (err) {
      console.error('Add question failed:', err)
      setAddError('Could not add the question. Please try again.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <>
      <Header title="Doctor Questions" emphasis="Questions" />
      <main className="px-4 py-5">
        {canEdit && (
          <form onSubmit={handleAdd} className="mb-6 rounded-card border border-hair bg-vellum p-4">
            <label htmlFor="new-question" className="label mb-1.5 block text-ink-3">New question</label>
            <textarea
              id="new-question"
              rows={2}
              className="field"
              placeholder="What do you want to ask at the next visit?"
              value={text}
              maxLength={1000}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="mt-3 flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <label htmlFor="new-question-visit" className="label mb-1.5 block text-ink-3">For visit</label>
                <VisitSelect id="new-question-visit" visits={upcoming} value={visitId} onChange={setVisitId} />
              </div>
              <Button type="submit" loading={adding} disabled={!text.trim()}>Add</Button>
            </div>
            {addError && <p role="alert" className="mt-2 text-sm text-critical">{addError}</p>}
          </form>
        )}

        <Tabs
          className="mb-3"
          activeTab={filter}
          onTabChange={(id) => setFilter(id as Filter)}
          tabs={[
            { id: 'open', label: `Open ${counts.open}` },
            { id: 'asked', label: `Asked ${counts.asked}` },
            { id: 'answered', label: `Answered ${counts.answered}` },
            { id: 'all', label: 'All' },
          ]}
        />

        {loading ? (
          <ListSkeleton rows={4} />
        ) : error ? (
          <p role="alert" className="pt-12 text-center text-[15px] text-critical">{error}</p>
        ) : shown.length === 0 ? (
          <p className="pt-12 text-center text-[15px] text-ink-2">
            {filter === 'open' ? 'No open questions.' : filter === 'all' ? 'No questions yet.' : `No ${filter} questions.`}
          </p>
        ) : (
          <ul className="border-t border-hair-2">
            {shown.map((q) => (
              <QuestionItem
                key={q.id}
                pid={pid!}
                question={q}
                visits={visitOptions}
                canEdit={canEdit}
                defaultVisitId={answerDefault}
              />
            ))}
          </ul>
        )}
      </main>
    </>
  )
}
