'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/** Set by popstate so a back/forward navigation keeps the restored position. */
let popped = false

/**
 * Scroll to the top on every route change. Next's own scroll-on-navigate
 * skips pages whose first element is the sticky header ("Skipping
 * auto-scroll behavior due to position: sticky"), leaving new screens
 * opened half-way down. Back/forward still restore position: popstate
 * navigations are left alone.
 */
export function ScrollToTop() {
  const pathname = usePathname()
  useEffect(() => {
    if (popped) {
      popped = false
      return
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])
  useEffect(() => {
    const onPop = () => {
      popped = true
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return null
}
