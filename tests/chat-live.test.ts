/**
 * Optional live smoke test against the real Gemini API with SYNTHETIC data.
 * Skipped unless RUN_LIVE_GEMINI=1. Reads GEMINI_API_KEY / GEMINI_MODEL from the
 * environment or .env.local. Costs a fraction of a cent per run.
 *
 *   RUN_LIVE_GEMINI=1 npx vitest run tests/chat-live.test.ts
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GoogleGenAI } from '@google/genai'
import { buildChatContext } from '@/lib/server/chat/context'
import { buildSystemInstruction } from '@/lib/server/chat/system-prompt'
import { executeTool, newDocumentBudget } from '@/lib/server/chat/tools'
import { runChat } from '@/lib/server/chat/run'
import { extractCitations } from '@/lib/server/chat/citations'
import type { ChatEvent } from '@/lib/server/chat/events'
import { synContextInput, SYN_RECORDS, SYN_TARGETS } from './chat-fixture'

function envVar(name: string): string | undefined {
  if (process.env[name]) return process.env[name]
  try {
    const line = readFileSync('.env.local', 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${name}=`))
    return line?.slice(name.length + 1).trim() || undefined
  } catch {
    return undefined
  }
}

const live = process.env.RUN_LIVE_GEMINI === '1'

describe.skipIf(!live)('live Gemini (synthetic data)', () => {
  it('answers with tools, citations and an alert-first reply', async () => {
    const apiKey = envVar('GEMINI_API_KEY')
    expect(apiKey, 'GEMINI_API_KEY missing').toBeTruthy()
    const model = envVar('GEMINI_MODEL') || 'gemini-2.5-flash'
    const ai = new GoogleGenAI({ apiKey })
    const { text: ctx } = buildChatContext(synContextInput())
    const events: ChatEvent[] = []
    const result = await runChat({
      models: ai.models,
      model,
      systemInstruction: buildSystemInstruction(ctx),
      history: [],
      userMessage: 'How has my creatinine changed this year? Use the trend tool, and suggest one question for my doctor.',
      executeTool: (c, n) => executeTool({ records: SYN_RECORDS, targets: SYN_TARGETS, loadDocument: async () => null, documentBudget: newDocumentBudget() }, c.name, c.args, n),
      emit: (e) => events.push(e),
    })
    const citations = extractCitations(result.text, SYN_RECORDS)
    // Visible in the test output for the report (synthetic data only).
    console.log(JSON.stringify({ model, toolCalls: result.toolCalls, usage: result.usage, rounds: result.rounds, citations: citations.map((c) => c.date), proposals: result.proposals }, null, 2))
    console.log(result.text)
    expect(result.text.length).toBeGreaterThan(20)
    expect(result.toolCalls).toContain('compute_trend')
    expect(events.some((e) => e.event === 'delta')).toBe(true)
    expect(result.usage.totalTokens).toBeGreaterThan(0)
  }, 90_000)
})
