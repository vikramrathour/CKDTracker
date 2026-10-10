'use client'

import { Suspense } from 'react'
import { ChatView } from '@/components/chat/chat-view'
import { ListSkeleton } from '@/components/ui/skeleton'

/**
 * /chat            thread list + starter prompts
 * /chat?id={id}    one thread
 * /chat?q={text}   prefilled question (e.g. from the dashboard alerts banner)
 */
export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <main className="px-4 py-4">
          <ListSkeleton rows={4} />
        </main>
      }
    >
      <ChatView />
    </Suspense>
  )
}
