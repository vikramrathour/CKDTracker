import { describe, expect, it, vi } from 'vitest'
import type { GenerateContentParameters, GenerateContentResponse } from '@google/genai'
import {
  DOCUMENT_INLINE_MAX_BYTES,
  DOCUMENT_INLINE_TOTAL_BYTES,
  MAX_DOCUMENTS_PER_MESSAGE,
  executeTool,
  newDocumentBudget,
  knownTestNames,
  TOOL_DECLARATIONS,
  validateToolArgs,
  type ToolEnv,
} from '@/lib/server/chat/tools'
import { BUDGET_ANSWER, ChatRunError, EMPTY_ANSWER, MAX_ROUNDS, runChat, usageFromError, type ModelsLike } from '@/lib/server/chat/run'
import type { ChatEvent } from '@/lib/server/chat/events'
import { SYN_RECORDS, SYN_TARGETS } from './chat-fixture'

const known = knownTestNames(SYN_RECORDS)

describe('tool declarations', () => {
  it('declares the four tools with required params', () => {
    expect(TOOL_DECLARATIONS.map((d) => d.name)).toEqual(['compute_trend', 'get_record', 'get_document', 'propose_doctor_question'])
    for (const d of TOOL_DECLARATIONS) expect(d.parameters?.required?.length).toBe(1)
  })
})

describe('validateToolArgs', () => {
  it('compute_trend: canonicalises test names and checks dates', () => {
    expect(validateToolArgs('compute_trend', { testName: 'egfr' }, known)).toEqual({ ok: true, args: { name: 'compute_trend', testName: 'eGFR', from: undefined, to: undefined } })
    expect(validateToolArgs('compute_trend', { testName: 'Unobtainium' }, known)).toMatchObject({ ok: false })
    expect(validateToolArgs('compute_trend', {}, known)).toMatchObject({ ok: false })
    expect(validateToolArgs('compute_trend', { testName: 'eGFR', from: '2026-02-30' }, known)).toMatchObject({ ok: false, error: 'from must be YYYY-MM-DD.' })
    expect(validateToolArgs('compute_trend', { testName: 'eGFR', from: '2026-09-01', to: '2026-01-01' }, known)).toMatchObject({ ok: false })
    expect(validateToolArgs('compute_trend', { testName: 'eGFR', from: '', to: null }, known)).toMatchObject({ ok: true })
  })

  it('ids must be plain doc ids (no path traversal)', () => {
    expect(validateToolArgs('get_record', { recordId: 'synA' }, known)).toMatchObject({ ok: true })
    for (const bad of ['../x', 'a/b', '', 'x'.repeat(129), 42]) {
      expect(validateToolArgs('get_record', { recordId: bad }, known)).toMatchObject({ ok: false })
      expect(validateToolArgs('get_document', { documentId: bad }, known)).toMatchObject({ ok: false })
    }
  })

  it('propose_doctor_question: length bounds and whitespace', () => {
    expect(validateToolArgs('propose_doctor_question', { text: '  Is my   level ok?  ' }, known)).toEqual({ ok: true, args: { name: 'propose_doctor_question', text: 'Is my level ok?' } })
    expect(validateToolArgs('propose_doctor_question', { text: 'short' }, known)).toMatchObject({ ok: false })
    expect(validateToolArgs('propose_doctor_question', { text: 'x'.repeat(301) }, known)).toMatchObject({ ok: false })
  })

  it('rejects unknown tools and non-object args', () => {
    expect(validateToolArgs('delete_everything', {}, known)).toMatchObject({ ok: false })
    expect(validateToolArgs('get_record', 'synA', known)).toMatchObject({ ok: false })
  })
})

describe('executeTool', () => {
  const env: ToolEnv = { records: SYN_RECORDS, targets: SYN_TARGETS, loadDocument: async () => null, documentBudget: newDocumentBudget() }

  it('compute_trend returns stats from the app and a chart', async () => {
    const out = await executeTool(env, 'compute_trend', { testName: 'Creatinine' })
    expect(out.response).toMatchObject({ testName: 'Creatinine', count: 4, first: { date: '2026-04-02', value: 1.1 }, last: { date: '2026-09-28', value: 1.42 }, change: 0.32, direction: 'worsening' })
    expect(out.chart?.points).toHaveLength(4)
    expect(out.chart).toMatchObject({ refMin: 0.7, refMax: 1.3 })
  })

  it('compute_trend prefers the patient target for the range and respects from/to', async () => {
    const out = await executeTool(env, 'compute_trend', { testName: 'Tacrolimus', from: '2026-06-01' })
    expect(out.response).toMatchObject({ count: 3, rangeUsed: { min: 5, max: 8, source: 'patient target' } })
    const one = await executeTool(env, 'compute_trend', { testName: 'Tacrolimus', from: '2026-09-01' })
    expect(one.response).toMatchObject({ count: 1, only: { recordId: 'synD' } })
    expect(one.chart).toBeUndefined()
  })

  it('get_record only sees this patient\'s records', async () => {
    expect((await executeTool(env, 'get_record', { recordId: 'synD' })).response).toMatchObject({ date: '2026-09-28', notes: 'Fasting sample' })
    expect((await executeTool(env, 'get_record', { recordId: 'otherPatientRecord' })).response).toHaveProperty('error')
  })

  it('get_document attaches inlineData within the size cap, refuses otherwise', async () => {
    const fresh = (loadDocument: ToolEnv['loadDocument']): ToolEnv => ({ ...env, loadDocument, documentBudget: newDocumentBudget() })
    const small = fresh(async () => ({ contentType: 'application/pdf', size: 4, data: Buffer.from('%PDF') }))
    const ok = await executeTool(small, 'get_document', { documentId: 'doc1' })
    expect(ok.parts?.[0]).toEqual({ inlineData: { mimeType: 'application/pdf', data: Buffer.from('%PDF').toString('base64') } })
    const big = fresh(async () => ({ contentType: 'application/pdf', size: DOCUMENT_INLINE_MAX_BYTES + 1 }))
    expect((await executeTool(big, 'get_document', { documentId: 'doc1' })).response.error).toMatch(/too large/)
    const exe = fresh(async () => ({ contentType: 'application/x-msdownload', size: 4, data: Buffer.from('MZ') }))
    expect((await executeTool(exe, 'get_document', { documentId: 'doc1' })).response.error).toMatch(/can't be read/)
    const boom = fresh(async () => { throw new Error('storage down') })
    expect((await executeTool(boom, 'get_document', { documentId: 'doc1' })).response.error).toMatch(/could not be loaded/)
  })

  it('get_document: at most MAX_DOCUMENTS_PER_MESSAGE documents per message, extra ones are not loaded', async () => {
    const loadDocument = vi.fn(async () => ({ contentType: 'application/pdf', size: 4, data: Buffer.from('%PDF') }))
    const e: ToolEnv = { ...env, loadDocument, documentBudget: newDocumentBudget() }
    for (let i = 0; i < MAX_DOCUMENTS_PER_MESSAGE; i++) {
      expect((await executeTool(e, 'get_document', { documentId: `doc${i}` })).parts).toHaveLength(1)
    }
    const over = await executeTool(e, 'get_document', { documentId: 'docX' })
    expect(over.response.error).toMatch(/limit reached/i)
    expect(over.parts).toBeUndefined()
    expect(loadDocument).toHaveBeenCalledTimes(MAX_DOCUMENTS_PER_MESSAGE)
  })

  it('get_document: total inline bytes per message are capped and passed to the loader', async () => {
    const budget = newDocumentBudget()
    budget.bytes = DOCUMENT_INLINE_TOTAL_BYTES - 10
    const loadDocument = vi.fn(async (_id: string, maxBytes: number) => ({
      contentType: 'application/pdf',
      size: 100,
      ...(100 <= maxBytes ? { data: Buffer.alloc(100) } : {}),
    }))
    const out = await executeTool({ ...env, loadDocument, documentBudget: budget }, 'get_document', { documentId: 'doc1' })
    expect(loadDocument).toHaveBeenCalledWith('doc1', 10)
    expect(out.response.error).toMatch(/limit reached/i)
    expect(out.parts).toBeUndefined()

    // A used-up allowance refuses before loading anything.
    const never = vi.fn(async () => null)
    const full = { calls: 0, bytes: DOCUMENT_INLINE_TOTAL_BYTES }
    const refused = await executeTool({ ...env, loadDocument: never, documentBudget: full }, 'get_document', { documentId: 'doc1' })
    expect(refused.response.error).toMatch(/limit reached/i)
    expect(never).not.toHaveBeenCalled()
  })

  it('propose_doctor_question proposes without writing, capped per message', async () => {
    const out = await executeTool(env, 'propose_doctor_question', { text: 'Should my tacrolimus dose be reviewed?' })
    expect(out.proposal).toBe('Should my tacrolimus dose be reviewed?')
    expect((await executeTool(env, 'propose_doctor_question', { text: 'Another question here?' }, 3)).proposal).toBeUndefined()
  })

  it('bad args go back to the model as an error, never throw', async () => {
    expect((await executeTool(env, 'compute_trend', { testName: 42 })).response).toHaveProperty('error')
  })
})

// ---------------------------------------------------------------- tool loop

type Chunk = Partial<GenerateContentResponse>
function fakeModels(rounds: Chunk[][]) {
  const calls: GenerateContentParameters[] = []
  const models: ModelsLike = {
    generateContentStream: vi.fn(async (params: GenerateContentParameters) => {
      calls.push(structuredClone(params))
      const chunks = rounds.shift() ?? []
      return (async function* () {
        for (const c of chunks) yield c as GenerateContentResponse
      })()
    }),
  }
  return { models, calls }
}
const textChunk = (text: string, usage?: Chunk['usageMetadata']): Chunk => ({ candidates: [{ content: { role: 'model', parts: [{ text }] } }], usageMetadata: usage })
const callChunk = (name: string, args: Record<string, unknown>, usage?: Chunk['usageMetadata']): Chunk => ({
  candidates: [{ content: { role: 'model', parts: [{ functionCall: { id: `id-${name}`, name, args }, thoughtSignature: 'sig' }] } }],
  usageMetadata: usage,
})

describe('runChat (mocked Gemini)', () => {
  const env: ToolEnv = { records: SYN_RECORDS, targets: SYN_TARGETS, loadDocument: async () => null, documentBudget: newDocumentBudget() }
  const base = (models: ModelsLike, events: ChatEvent[]) => ({
    models,
    model: 'test-model',
    systemInstruction: 'SYS',
    history: [],
    userMessage: 'How is my creatinine?',
    executeTool: (c: { name?: string; args?: Record<string, unknown> }, n: number) => executeTool(env, c.name, c.args, n),
    emit: (e: ChatEvent) => events.push(e),
  })

  it('runs tools, streams the final answer and sums usage across rounds', async () => {
    const { models, calls } = fakeModels([
      [callChunk('compute_trend', { testName: 'Creatinine' }, { promptTokenCount: 1000, candidatesTokenCount: 10, thoughtsTokenCount: 5, totalTokenCount: 1015 })],
      [
        callChunk('propose_doctor_question', { text: 'Is my creatinine rise a concern?' }),
        { usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 8, totalTokenCount: 1208 } },
      ],
      [textChunk('Creatinine rose to **1.42** '), textChunk('[2026-09-28].', { promptTokenCount: 1300, candidatesTokenCount: 40, totalTokenCount: 1340 })],
    ])
    const events: ChatEvent[] = []
    const r = await runChat(base(models, events))

    expect(r.text).toBe('Creatinine rose to **1.42** [2026-09-28].')
    expect(r.toolCalls).toEqual(['compute_trend', 'propose_doctor_question'])
    expect(r.proposals).toEqual(['Is my creatinine rise a concern?'])
    expect(r.charts[0].testName).toBe('Creatinine')
    expect(r.usage).toEqual({ tokensIn: 3500, tokensOut: 63, totalTokens: 3563 })
    expect(events.map((e) => e.event)).toEqual(['chart', 'proposal', 'delta', 'delta'])

    // Round 2 got the model turn (with its thought signature) + the function response.
    const round2 = calls[1].contents as { role: string; parts: Record<string, unknown>[] }[]
    expect(round2.at(-2)).toMatchObject({ role: 'model', parts: [{ thoughtSignature: 'sig', functionCall: { name: 'compute_trend' } }] })
    expect(round2.at(-1)?.parts[0]).toMatchObject({ functionResponse: { id: 'id-compute_trend', name: 'compute_trend', response: { testName: 'Creatinine' } } })
    expect(calls[0].config?.systemInstruction).toBe('SYS')
  })

  it('forces a text answer on the last round and falls back when the model says nothing', async () => {
    const loop = Array.from({ length: MAX_ROUNDS }, () => [callChunk('get_record', { recordId: 'synA' })])
    const { models, calls } = fakeModels(loop)
    const events: ChatEvent[] = []
    const r = await runChat(base(models, events))
    expect(calls).toHaveLength(MAX_ROUNDS)
    expect(calls.at(-1)?.config?.toolConfig?.functionCallingConfig?.mode).toBe('NONE')
    expect(calls[0].config?.toolConfig).toBeUndefined()
    expect(r.text).toBe(EMPTY_ANSWER)
    expect(events.at(-1)).toEqual({ event: 'delta', data: { text: EMPTY_ANSWER } })
  })

  it('separates text written before and after a tool call', async () => {
    const { models } = fakeModels([
      [textChunk('Let me check.'), callChunk('get_record', { recordId: 'synA' })],
      [textChunk('Your April report looks steady [2026-04-02].')],
    ])
    const r = await runChat(base(models, []))
    expect(r.text).toBe('Let me check.\n\nYour April report looks steady [2026-04-02].')
  })

  it('does not forward thought parts to the user', async () => {
    const { models } = fakeModels([[{ candidates: [{ content: { parts: [{ text: 'secret reasoning', thought: true }, { text: 'Answer.' }] } }] }]])
    const events: ChatEvent[] = []
    const r = await runChat(base(models, events))
    expect(r.text).toBe('Answer.')
    expect(JSON.stringify(events)).not.toContain('secret')
  })

  it('propagates model errors to the caller', async () => {
    const models: ModelsLike = { generateContentStream: async () => { throw Object.assign(new Error('quota'), { status: 429 }) } }
    await expect(runChat(base(models, []))).rejects.toMatchObject({ status: 429 })
  })

  it('a failure in a later round still reports the tokens already used (completed + partial round)', async () => {
    let round = 0
    const models: ModelsLike = {
      generateContentStream: async () => {
        round++
        if (round === 1) {
          return (async function* () {
            yield callChunk('compute_trend', { testName: 'Creatinine' }, { promptTokenCount: 1000, candidatesTokenCount: 10, totalTokenCount: 1010 }) as GenerateContentResponse
          })()
        }
        return (async function* () {
          yield textChunk('Partial ', { promptTokenCount: 1100, candidatesTokenCount: 5, totalTokenCount: 1105 }) as GenerateContentResponse
          throw Object.assign(new Error('stream reset'), { status: 503 })
        })()
      },
    }
    const err = await runChat(base(models, [])).then(() => null, (e) => e)
    expect(err).toBeInstanceOf(ChatRunError)
    expect(err.status).toBe(503)
    expect(err.usage).toEqual({ tokensIn: 2100, tokensOut: 15, totalTokens: 2115 })
    expect(usageFromError(err)).toEqual(err.usage)
  })

  it('an error before any usage reports zero tokens', async () => {
    const models: ModelsLike = { generateContentStream: async () => { throw new Error('offline') } }
    const err = await runChat(base(models, [])).then(() => null, (e) => e)
    expect(usageFromError(err)).toEqual({ tokensIn: 0, tokensOut: 0, totalTokens: 0 })
    expect(usageFromError(new Error('plain'))).toEqual({ tokensIn: 0, tokensOut: 0, totalTokens: 0 })
  })

  it('stops starting new rounds once the monthly token budget is used up', async () => {
    const { models, calls } = fakeModels([
      [callChunk('get_record', { recordId: 'synA' }, { promptTokenCount: 900, candidatesTokenCount: 200, totalTokenCount: 1100 })],
      [textChunk('never reached')],
    ])
    const events: ChatEvent[] = []
    const r = await runChat({ ...base(models, events), tokenBudget: 1000 })
    expect(calls).toHaveLength(1)
    expect(r.budgetExhausted).toBe(true)
    expect(r.text).toBe(BUDGET_ANSWER)
    expect(r.usage.totalTokens).toBe(1100)
  })
})
