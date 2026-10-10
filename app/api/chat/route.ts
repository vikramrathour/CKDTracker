import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { errorResponse, HttpError, requireMember } from '@/lib/server/auth'
import { getAdminDb } from '@/lib/server/firebase-admin'
import { GEMINI_MODEL, getGemini } from '@/lib/server/gemini'
import { hasUsage, recordChatTokens, releaseChatMessage, reserveChatMessage, UsageLimitError } from '@/lib/server/usage'
import { buildChatContext } from '@/lib/server/chat/context'
import { buildSystemInstruction } from '@/lib/server/chat/system-prompt'
import { executeTool, newDocumentBudget } from '@/lib/server/chat/tools'
import { runChat, usageFromError } from '@/lib/server/chat/run'
import type { ChatUsage } from '@/lib/server/chat/events'
import { extractCitations } from '@/lib/server/chat/citations'
import { encodeSSE, type ChatEvent } from '@/lib/server/chat/events'
import { friendlyModelError, parseChatRequest, titleFromMessage, todayIst } from '@/lib/server/chat/request'
import { loadChatContextInput, loadDocumentForPatient, loadHistory, loadLabRecords } from '@/lib/server/chat/loader'

/**
 * POST /api/chat {pid, chatId?, message}
 *
 * Any member (viewer+) of the patient can chat. Threads are private to their
 * creator. Validation/auth/cap failures return JSON errors; once the model
 * call starts the response is an SSE stream (see lib/server/chat/events.ts).
 *
 * Privacy: never log message text or medical values here.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = parseChatRequest(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status })
  const { pid, message } = parsed.value

  let uid: string
  let chatId = parsed.value.chatId
  const db = getAdminDb()
  try {
    const { user } = await requireMember(req, pid, 'viewer')
    uid = user.uid
    if (chatId) {
      const thread = await db.doc(`patients/${pid}/chats/${chatId}`).get()
      if (!thread.exists || thread.get('createdBy') !== uid) throw new HttpError(404, 'Chat not found')
    }
  } catch (err) {
    return errorResponse(err)
  }

  let usageKeys
  try {
    usageKeys = await reserveChatMessage(db, uid)
  } catch (err) {
    if (err instanceof UsageLimitError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 429 })
    }
    return errorResponse(err)
  }

  // Load everything before streaming so setup failures are plain JSON errors.
  let records, contextInput, history, threadRef, userRef
  try {
    records = await loadLabRecords(db, pid)
    ;[contextInput, history] = await Promise.all([
      loadChatContextInput(db, pid, records, todayIst()),
      chatId ? loadHistory(db, pid, chatId) : Promise.resolve([]),
    ])
    if (!chatId) {
      const ref = db.collection(`patients/${pid}/chats`).doc()
      await ref.set({
        createdBy: uid,
        title: titleFromMessage(message),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        messageCount: 0,
      })
      chatId = ref.id
    }
    threadRef = db.doc(`patients/${pid}/chats/${chatId}`)
    userRef = threadRef.collection('messages').doc()
    await userRef.set({ role: 'user', text: message, createdAt: FieldValue.serverTimestamp() })
    await threadRef.update({ updatedAt: FieldValue.serverTimestamp(), messageCount: FieldValue.increment(1) })
  } catch (err) {
    await releaseChatMessage(db, usageKeys).catch(() => {})
    return errorResponse(err)
  }
  const messagesCol = threadRef.collection('messages')

  const { text: contextText } = buildChatContext(contextInput)
  const systemInstruction = buildSystemInstruction(contextText)
  const toolEnv = {
    records,
    targets: contextInput.targets,
    loadDocument: (documentId: string, maxBytes: number) => loadDocumentForPatient(pid, documentId, maxBytes),
    documentBudget: newDocumentBudget(),
  }
  const finalChatId = chatId

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true
      const emit = (e: ChatEvent) => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode(encodeSSE(e)))
        } catch {
          open = false // client went away; keep going so the answer is still saved
        }
      }

      emit({ event: 'meta', data: { chatId: finalChatId, userMessageId: userRef.id } })
      // Tokens consumed by this message, billed whatever happens next.
      let usage: ChatUsage | null = null
      try {
        const result = await runChat({
          models: getGemini().models,
          model: GEMINI_MODEL,
          systemInstruction,
          history,
          userMessage: message,
          executeTool: (call, proposalsSoFar) => executeTool(toolEnv, call.name, call.args, proposalsSoFar),
          emit,
          tokenBudget: usageKeys.remainingTokens,
        })
        usage = result.usage
        const citations = extractCitations(result.text, records)
        const modelRef = messagesCol.doc()
        await modelRef.set({
          role: 'model',
          text: result.text,
          citations: Array.from(new Set(citations.flatMap((c) => c.recordIds))),
          citationMap: Object.fromEntries(citations.map((c) => [c.date, c.recordIds])),
          toolCalls: result.toolCalls,
          proposals: result.proposals,
          charts: result.charts,
          tokensIn: result.usage.tokensIn,
          tokensOut: result.usage.tokensOut,
          model: GEMINI_MODEL,
          createdAt: FieldValue.serverTimestamp(),
        })
        await threadRef.update({ updatedAt: FieldValue.serverTimestamp(), messageCount: FieldValue.increment(1) })
        emit({ event: 'done', data: { messageId: modelRef.id, citations, usage: result.usage } })
      } catch (err) {
        if (!usage) usage = usageFromError(err)
        const status = (err as { status?: number })?.status
        console.error(`Chat: model call failed (${err instanceof Error ? err.name : 'unknown'}${status ? `, status ${status}` : ''})`)
        emit({ event: 'error', data: friendlyModelError(err) })
      }
      // Bill what was used; only a message that consumed nothing is given back.
      if (hasUsage(usage)) {
        await recordChatTokens(db, usageKeys, usage).catch(() => {
          console.error('Chat: failed to record token usage')
        })
      } else {
        await releaseChatMessage(db, usageKeys).catch(() => {})
      }
      if (open) {
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
