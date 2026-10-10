'use client'

import { useEffect, useState } from 'react'

/**
 * Presentation mapping for lab-value statuses (from getLabValueStatus).
 * good    → sage (normal)
 * warning → terra-dk on terra-pale (borderline: outside range by ≤50% of its width)
 * danger  → terra, stronger treatment (abnormal: further outside range)
 * Deep red (`critical`) is reserved for alerts and errors, used sparingly.
 */
export type Status = 'good' | 'warning' | 'danger'

export const STATUS_STYLES: Record<
  Status,
  { text: string; bg: string; dot: string; border: string; label: string }
> = {
  good: {
    text: 'text-sage',
    bg: 'bg-sage-pale',
    dot: 'bg-sage',
    border: 'border-hair',
    label: 'Normal',
  },
  warning: {
    text: 'text-terra-dk',
    bg: 'bg-terra-pale',
    // hollow terra ring: borderline
    dot: 'bg-transparent ring-[1.5px] ring-inset ring-terra',
    border: 'border-hair-hot',
    label: 'Borderline',
  },
  danger: {
    text: 'text-terra-dk',
    bg: 'bg-terra-pale',
    dot: 'bg-terra',
    border: 'border-terra',
    label: 'Out of range',
  },
}

/** Health-score bands, matching the thresholds in lib/calculations/health-score.ts */
export function scoreStatus(score: number): Status {
  if (score >= 80) return 'good'
  if (score >= 60) return 'warning'
  return 'danger'
}

export interface ThemeColors {
  ink: string
  ink2: string
  ink3: string
  terra: string
  terraDk: string
  terraPale: string
  sage: string
  sagePale: string
  critical: string
  vellum: string
  recess: string
  hair: string
  hair2: string
}

const LIGHT: ThemeColors = {
  ink: '#121A24',
  ink2: '#4E5866',
  ink3: '#656D7A',
  terra: '#C2633E',
  terraDk: '#9A4522',
  terraPale: '#FBE9E0',
  sage: '#2B5C57',
  sagePale: '#E1EEEC',
  critical: '#9B2C2C',
  vellum: '#FFFFFF',
  recess: '#EDEBE4',
  hair: 'rgba(18,26,36,.08)',
  hair2: 'rgba(18,26,36,.15)',
}

function readColors(): ThemeColors {
  const s = getComputedStyle(document.documentElement)
  const rgb = (name: string, fallback: string) => {
    const raw = s.getPropertyValue(`--${name}`).trim()
    return raw ? `rgb(${raw.split(/\s+/).join(',')})` : fallback
  }
  const raw = (name: string, fallback: string) => s.getPropertyValue(`--${name}`).trim() || fallback
  return {
    ink: rgb('ink', LIGHT.ink),
    ink2: rgb('ink-2', LIGHT.ink2),
    ink3: rgb('ink-3', LIGHT.ink3),
    terra: rgb('terra', LIGHT.terra),
    terraDk: rgb('terra-dk', LIGHT.terraDk),
    terraPale: rgb('terra-pale', LIGHT.terraPale),
    sage: rgb('sage', LIGHT.sage),
    sagePale: rgb('sage-pale', LIGHT.sagePale),
    critical: rgb('critical', LIGHT.critical),
    vellum: rgb('vellum', LIGHT.vellum),
    recess: rgb('recess', LIGHT.recess),
    hair: raw('hair', LIGHT.hair),
    hair2: raw('hair-2', LIGHT.hair2),
  }
}

/**
 * Resolved palette for SVG/Recharts props, which take literal colours
 * (CSS variables are unreliable in SVG presentation attributes).
 * Re-reads when the `dark` class on <html> changes.
 */
export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(LIGHT)

  useEffect(() => {
    const update = () => setColors(readColors())
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return colors
}

export function statusColor(status: Status, c: ThemeColors): string {
  return status === 'good' ? c.sage : c.terra
}
