import Link from 'next/link'

/** Contact address shown on the legal pages. Set NEXT_PUBLIC_SUPPORT_EMAIL before publishing. */
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'privacy@example.com'

export const LEGAL_EFFECTIVE_DATE = '10 October 2026'

/** Shared shell for /privacy and /terms: public, server-rendered, design-system typography. */
export function LegalPage({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-5 pb-16 pt-10">
      <nav className="mb-10 flex items-center justify-between text-[13px]">
        <Link href="/dashboard" className="tlink">
          ← CKD Tracker
        </Link>
        <span className="flex gap-4">
          <Link href="/privacy" className="tlink">
            Privacy
          </Link>
          <Link href="/terms" className="tlink">
            Terms
          </Link>
        </span>
      </nav>
      <p className="eyebrow mb-4">{eyebrow}</p>
      <h1 className="font-serif text-[2.4rem] font-normal leading-[1.08] tracking-[-.025em] text-ink">{title}</h1>
      <p className="mt-3 text-[13px] text-ink-3">Effective {LEGAL_EFFECTIVE_DATE}</p>
      <hr className="my-8 h-0.5 w-9 border-0 bg-terra" />
      <div className="space-y-8 text-[15px] leading-relaxed text-ink-2">{children}</div>
    </main>
  )
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 font-serif text-xl font-medium tracking-[-.015em] text-ink">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export function LegalList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-terra">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}
