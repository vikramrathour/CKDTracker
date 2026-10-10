import { Eye, PencilLine } from 'lucide-react'
import { ROLE_COPY } from './share'

/** Two-line explainer of what viewers and editors can do. */
export function RoleExplainer() {
  const rows = [
    { role: 'viewer' as const, icon: Eye },
    { role: 'editor' as const, icon: PencilLine },
  ]
  return (
    <ul className="space-y-3">
      {rows.map(({ role, icon: Icon }) => (
        <li key={role} className="flex gap-3">
          <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-recess text-ink-3" aria-hidden>
            <Icon className="h-4 w-4" />
          </span>
          <p className="text-sm text-ink-2">
            <span className="font-semibold text-ink">{ROLE_COPY[role].label}:</span> {ROLE_COPY[role].long}
          </p>
        </li>
      ))}
    </ul>
  )
}
