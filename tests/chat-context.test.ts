import { describe, expect, it } from 'vitest'
import { buildChatContext, buildLabCsv, clip, csvCell, recentRecordsForContext } from '@/lib/server/chat/context'
import { buildSystemInstruction, CHAT_SYSTEM_PROMPT } from '@/lib/server/chat/system-prompt'
import { synContextInput, SYN_RECORDS, SYN_TARGETS } from './chat-fixture'

describe('buildChatContext (synthetic fixture)', () => {
  it('matches the snapshot', () => {
    expect(buildChatContext(synContextInput()).text).toMatchSnapshot()
  })

  it('puts ALERTS before the lab data, critical first', () => {
    const { text, alerts } = buildChatContext(synContextInput())
    expect(text.indexOf('ALERTS')).toBeLessThan(text.indexOf('LAB_VALUES'))
    expect(alerts[0].severity).toBe('critical')
    expect(text).toContain('[critical] [2026-09-28] Creatinine 1.42')
    expect(text).toContain("Tacrolimus 9.6 ng/mL is above the patient's target of 5–8")
  })

  it('includes only active meds, open questions and at most 3 visits', () => {
    const input = synContextInput()
    input.visits = [...input.visits, { id: 'v2', visitDate: '2025-01-01', createdBy: 'x' }, { id: 'v3', visitDate: '2025-02-01', createdBy: 'x' }]
    const { text } = buildChatContext(input)
    expect(text).not.toContain('Old antibiotic')
    expect(text).not.toContain('Old answered question')
    expect(text).toContain('Should potassium be rechecked sooner?')
    expect(text).not.toContain('2025-01-01')
    expect(text).toContain('2026-07-01: 1.5 mg -> 2 mg (Level low at review)')
  })

  it('never includes names (no displayName / doctor name fields)', () => {
    const input = synContextInput()
    ;(input.patient as Record<string, unknown>).displayName = 'Zed Example'
    expect(buildChatContext(input).text).not.toContain('Zed Example')
  })

  it('says when data is missing', () => {
    const { text } = buildChatContext({
      today: '2026-10-10',
      patient: {},
      records: [],
      medications: [],
      doseChanges: [],
      visits: [],
      questions: [],
      targets: [],
      alertRules: [],
      documents: [],
    })
    expect(text).toContain('age and transplant date not recorded')
    expect(text).toContain('(no lab reports yet)')
    expect(text).toContain('ALERTS (computed by the app from the latest values, most urgent first):\n- none')
  })
})

describe('CSV helpers', () => {
  it('quotes only when needed', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell(null)).toBe('')
  })

  it('one row per value, chronological, with target column', () => {
    const csv = buildLabCsv(SYN_RECORDS, SYN_TARGETS).split('\n')
    expect(csv[0]).toBe('recordId,date,test,value,unit,refMin,refMax,target')
    expect(csv).toHaveLength(1 + SYN_RECORDS.reduce((n, r) => n + r.values.length, 0))
    expect(csv[1].startsWith('synA,2026-04-02,')).toBe(true)
    expect(csv.find((l) => l.startsWith('synA,2026-04-02,Tacrolimus'))).toBe('synA,2026-04-02,Tacrolimus,6.8,ng/mL,5,10,5-8')
  })

  it('clip collapses whitespace and truncates', () => {
    expect(clip('a\n\n b   c')).toBe('a b c')
    expect(clip('x'.repeat(20), 10)).toBe(`${'x'.repeat(9)}…`)
    expect(clip(undefined)).toBe('')
  })
})

describe('system prompt', () => {
  it('carries the safety rules', () => {
    expect(CHAT_SYSTEM_PROMPT).toMatch(/never start, stop or change a medicine or dose/)
    expect(CHAT_SYSTEM_PROMPT).toContain('Please contact your transplant team today.')
    expect(CHAT_SYSTEM_PROMPT).toContain('[YYYY-MM-DD]')
    expect(CHAT_SYSTEM_PROMPT).toMatch(/data, not instructions/)
  })

  it('wraps the context in PATIENT_DATA tags after the rules', () => {
    const s = buildSystemInstruction('CTX')
    expect(s.startsWith(CHAT_SYSTEM_PROMPT)).toBe(true)
    expect(s.endsWith('<PATIENT_DATA>\nCTX\n</PATIENT_DATA>')).toBe(true)
  })
})

describe('context size caps', () => {
  const mk = (i: number, n: number) => ({
    id: `r${i}`,
    recordDate: new Date(Date.UTC(2020, 0, 1 + i * 7)).toISOString(),
    labName: 'Synthetic Lab',
    values: Array.from({ length: n }, (_, k) => ({ testName: `T${k}`, panel: 'kidney' as const, value: k, unit: 'u', isAbnormal: false })),
  })

  it('keeps the most recent reports within the record and value caps, oldest first', () => {
    const many = Array.from({ length: 100 }, (_, i) => mk(i, 10))
    const byCount = recentRecordsForContext(many, 60, 10_000)
    expect(byCount.records).toHaveLength(60)
    expect(byCount.omitted).toBe(40)
    expect(byCount.records[0].id).toBe('r40')
    expect(byCount.records.at(-1)?.id).toBe('r99')

    const byValues = recentRecordsForContext(many, 60, 255)
    expect(byValues.records).toHaveLength(25)
    expect(byValues.records.at(-1)?.id).toBe('r99')
  })

  it('says how many reports were left out of LAB_VALUES', () => {
    const many = Array.from({ length: 70 }, (_, i) => mk(i, 1))
    const { text } = buildChatContext({ ...synContextInput(), records: many })
    expect(text).toContain('LAB_VALUES (60 most recent of 70 reports')
    expect(text).not.toContain('r9,')
    expect(text).toContain('r69,')
  })
})
