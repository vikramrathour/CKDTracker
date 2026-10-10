import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Join a care circle · CKD Tracker',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

/** Public (signed-out) layout for invite links, outside the app shell. */
export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen min-h-[100dvh] flex-col justify-center bg-canvas px-6 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]">
      <div className="mx-auto w-full max-w-sm">{children}</div>
    </div>
  )
}
