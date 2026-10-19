import {
  FunctionCallingConfigMode,
  type Content,
  type FunctionCall,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type Part,
} from '@google/genai'
import { TOOL_DECLARATIONS, type ToolOutcome } from './tools'
import type { ChartPayload, ChatEvent, ChatUsage } from './events'

/**
 * The chat tool loop. Each round streams (generateContentStream), so text the
 * model writes is forwarded as `delta` events immediately; if the round ends
 * with function calls they are executed and the loop continues, up to
 * MAX_ROUNDS. The final round disables tools so the model must answer in text.
 *
 * The Gemini client is injected, so tests drive this with a fake stream.
 *
 * Usage accounting: token usage is summed across rounds. If a round throws,
 * the error is re-thrown as a ChatRunError carrying the usage consumed so far
 * (including the failed round's last usageMetadata), so the route can still
 * bill it. `tokenBudget` (what is left of the user's monthly cap) is checked
 * after every round: once spent, no further rounds are started.
 */

export const MAX_ROUNDS = 4

export interface ModelsLike {
  generateContentStream(params: GenerateContentParameters): Promise<AsyncGenerator<GenerateContentResponse>>
}

export interface RunChatOptions {
  models: ModelsLike
  model: string
  systemInstruction: string
  /** Earlier turns of this thread (oldest first), excluding the new message. */
  history: Content[]
  userMessage: string
  executeTool: (call: FunctionCall, proposalsSoFar: number) => Promise<ToolOutcome>
  emit: (e: ChatEvent) => void
  maxRounds?: number
  maxOutputTokens?: number
  /** Remaining monthly tokens; no new round starts once usage reaches it. */
  tokenBudget?: number
}

export interface RunChatResult {
  text: string
  toolCalls: string[]
  proposals: string[]
  charts: ChartPayload[]
  usage: ChatUsage
  rounds: number
  /** True when the loop stopped early because tokenBudget was used up. */
  budgetExhausted?: boolean
}

export const EMPTY_ANSWER =
  "Sorry — I couldn't put together an answer this time. Please try rephrasing your question."

export const BUDGET_ANSWER =
  "Sorry — this month's chat allowance ran out while I was working on this. It resets on the 1st."

const ZERO_USAGE: ChatUsage = { tokensIn: 0, tokensOut: 0, totalTokens: 0 }

/** A failed runChat, with the tokens already consumed (bill them). */
export class ChatRunError extends Error {
  usage: ChatUsage
  status?: number
  cause: unknown

  constructor(cause: unknown, usage: ChatUsage) {
    super(cause instanceof Error ? cause.message : 'Chat run failed')
    this.name = 'ChatRunError'
    this.cause = cause
    this.usage = usage
    const status = (cause as { status?: unknown })?.status
    if (typeof status === 'number') this.status = status
  }
}

/** Usage from any error (ChatRunError or one with a `usage` field); zero otherwise. */
export function usageFromError(err: unknown): ChatUsage {
  const u = (err as { usage?: Partial<ChatUsage> })?.usage
  if (!u || typeof u !== 'object') return { ...ZERO_USAGE }
  return {
    tokensIn: Number(u.tokensIn) || 0,
    tokensOut: Number(u.tokensOut) || 0,
    totalTokens: Number(u.totalTokens) || 0,
  }
}

export function addUsage(total: ChatUsage, meta: GenerateContentResponse['usageMetadata'] | undefined): ChatUsage {
  if (!meta) return total
  const tokensIn = (meta.promptTokenCount ?? 0) + (meta.toolUsePromptTokenCount ?? 0)
  const tokensOut = (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0)
  return {
    tokensIn: total.tokensIn + tokensIn,
    tokensOut: total.tokensOut + tokensOut,
    totalTokens: total.totalTokens + (meta.totalTokenCount ?? tokensIn + tokensOut),
  }
}

export async function runChat(opts: RunChatOptions): Promise<RunChatResult> {
  const state = { usage: { ...ZERO_USAGE } }
  try {
    return await runChatLoop(opts, state)
  } catch (err) {
    throw new ChatRunError(err, state.usage)
  }
}

async function runChatLoop(opts: RunChatOptions, state: { usage: ChatUsage }): Promise<RunChatResult> {
  const maxRounds = opts.maxRounds ?? MAX_ROUNDS
  const contents: Content[] = [...opts.history, { role: 'user', parts: [{ text: opts.userMessage }] }]
  const result: RunChatResult = {
    text: '',
    toolCalls: [],
    proposals: [],
    charts: [],
    usage: { ...ZERO_USAGE },
    rounds: 0,
  }
  const budget = opts.tokenBudget ?? Infinity

  for (let round = 0; round < maxRounds; round++) {
    result.rounds = round + 1
    const lastRound = round === maxRounds - 1
    const stream = await opts.models.generateContentStream({
      model: opts.model,
      contents,
      config: {
        systemInstruction: opts.systemInstruction,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        toolConfig: lastRound ? { functionCallingConfig: { mode: FunctionCallingConfigMode.NONE } } : undefined,
        temperature: 0.3,
        maxOutputTokens: opts.maxOutputTokens ?? 4096,
        // A small thinking budget per round: unbounded thinking made multi-round
        // answers run past Netlify's 30 s function limit.
        thinkingConfig: { thinkingBudget: 512 },
      },
    })

    const modelParts: Part[] = []
    const calls: FunctionCall[] = []
    let lastUsage: GenerateContentResponse['usageMetadata'] | undefined
    let textThisRound = false
    // Bill whatever this round reported if the stream breaks part-way.
    const before = result.usage
    const track = () => {
      state.usage = addUsage(before, lastUsage)
    }

    for await (const chunk of stream) {
      if (chunk.usageMetadata) {
        lastUsage = chunk.usageMetadata
        track()
      }
      const parts = chunk.candidates?.[0]?.content?.parts ?? []
      for (const part of parts) {
        modelParts.push(part)
        if (part.functionCall) {
          calls.push(part.functionCall)
        } else if (typeof part.text === 'string' && part.text && !part.thought) {
          // Separate text from an earlier round ("Let me check…") from this one.
          const text = !textThisRound && result.text && !/\s$/.test(result.text) ? `\n\n${part.text}` : part.text
          textThisRound = true
          result.text += text
          opts.emit({ event: 'delta', data: { text } })
        }
      }
    }
    // usageMetadata is cumulative within one request: count the last one.
    result.usage = addUsage(result.usage, lastUsage)
    state.usage = result.usage

    if (calls.length === 0 || lastRound) break
    if (result.usage.totalTokens >= budget) {
      result.budgetExhausted = true
      break
    }

    contents.push({ role: 'model', parts: modelParts })
    const responseParts: Part[] = []
    const extraParts: Part[] = []
    for (const call of calls) {
      const outcome = await opts.executeTool(call, result.proposals.length)
      result.toolCalls.push(outcome.name)
      responseParts.push({ functionResponse: { id: call.id, name: call.name, response: outcome.response } })
      if (outcome.parts) extraParts.push(...outcome.parts)
      if (outcome.chart) {
        result.charts.push(outcome.chart)
        opts.emit({ event: 'chart', data: outcome.chart })
      }
      if (outcome.proposal) {
        result.proposals.push(outcome.proposal)
        opts.emit({ event: 'proposal', data: { text: outcome.proposal } })
      }
    }
    contents.push({ role: 'user', parts: [...responseParts, ...extraParts] })
  }

  if (!result.text.trim()) {
    result.text = result.budgetExhausted ? BUDGET_ANSWER : EMPTY_ANSWER
    opts.emit({ event: 'delta', data: { text: result.text } })
  }
  return result
}
