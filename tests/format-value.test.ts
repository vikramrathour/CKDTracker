import { describe, expect, it } from 'vitest'
import { formatValue } from '@/lib/utils'

describe('formatValue', () => {
  it('keeps the precision a lab reports', () => {
    expect(formatValue(1.15, 'mg/dL')).toBe('1.15')
    expect(formatValue(1.015, '')).toBe('1.015')
    expect(formatValue(4.85, 'mmol/L')).toBe('4.85')
  })
  it('trims float noise and trailing zeros', () => {
    expect(formatValue(0.1 + 0.2, 'mg/dL')).toBe('0.3')
    expect(formatValue(42, '%')).toBe('42')
    expect(formatValue(13.9, 'g/dL')).toBe('13.9')
    expect(formatValue(182.04, 'mg/dL')).toBe('182')
  })
  it('groups large values', () => {
    expect(formatValue(7400.4, '/cumm')).toBe((7400).toLocaleString())
  })
})
