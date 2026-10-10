import type { Metadata } from 'next'
import { RetryButton } from '@/components/notifications/retry-button'

export const metadata: Metadata = { title: 'Offline · CKD Tracker' }

/**
 * Served by the service worker (app/sw.ts) when a page that was never
 * visited is opened without a connection. Pages you've opened before load
 * from cache, and Firestore serves their data from its offline cache.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <p className="eyebrow mb-4">CKD Tracker</p>
      <h1 className="font-serif text-[2.25rem] font-normal leading-[1.1] tracking-[-.02em] text-ink">
        You’re <em className="italic text-terra-dk">offline</em>
      </h1>
      <p className="mt-4 font-serif text-lg italic leading-relaxed text-ink-2">
        This page hasn’t been saved on this device yet.
      </p>
      <hr className="my-8 h-0.5 w-9 border-0 bg-terra" />
      <p className="text-sm leading-relaxed text-ink-2">
        Pages you’ve opened before, like the dashboard and your records, still work without a connection. Changes
        you make offline are saved and synced when you’re back online.
      </p>
      <div className="mt-8">
        <RetryButton />
      </div>
    </main>
  )
}
