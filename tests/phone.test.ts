import { describe, expect, it } from 'vitest'
import { formatPhoneForDisplay, maskPhone, normalizeIndianPhone } from '@/lib/phone'

// Synthetic numbers only (+91 99999 0000x are the Firebase test-number range we document).
const E164 = '+919999900001'

describe('normalizeIndianPhone', () => {
  it.each([
    ['9999900001'],
    ['99999 00001'],
    ['99999-00001'],
    ['(99999) 00001'],
    ['+91 99999 00001'],
    ['+91-99999-00001'],
    ['+919999900001'],
    ['91 99999 00001'],
    ['919999900001'],
    ['09999900001'],
    ['099999 00001'],
    ['0091 99999 00001'],
    ['00919999900001'],
    ['  9999900001  '],
  ])('accepts %j', (input) => {
    expect(normalizeIndianPhone(input)).toBe(E164)
  })

  it('accepts every valid mobile leading digit (6-9)', () => {
    expect(normalizeIndianPhone('6000000001')).toBe('+916000000001')
    expect(normalizeIndianPhone('7000000001')).toBe('+917000000001')
    expect(normalizeIndianPhone('8000000001')).toBe('+918000000001')
    expect(normalizeIndianPhone('9000000001')).toBe('+919000000001')
  })

  it.each([
    ['landline with STD code', '011 2345 6789'],
    ['landline in E.164', '+91 11 2345 6789'],
    ['mobile-length number with an invalid leading digit', '5999900001'],
    ['too short', '99999'],
    ['nine digits', '999990000'],
    ['eleven digits without trunk prefix', '99999000011'],
    ['non-Indian number', '+1 650 555 0100'],
    ['UK mobile', '+44 7700 900001'],
    ['letters', '99999ABCDE'],
    ['trailing junk', '9999900001x'],
    ['extension', '9999900001 ext 2'],
    ['plus in the middle', '91+9999900001'],
    ['empty', ''],
    ['whitespace', '   '],
    ['only plus', '+'],
  ])('rejects %s', (_label, input) => {
    expect(normalizeIndianPhone(input)).toBeNull()
  })

  it('rejects non-string input', () => {
    expect(normalizeIndianPhone(null)).toBeNull()
    expect(normalizeIndianPhone(undefined)).toBeNull()
    expect(normalizeIndianPhone(9999900001 as unknown as string)).toBeNull()
  })

  it('is idempotent on its own output', () => {
    const once = normalizeIndianPhone('099999 00001')
    expect(normalizeIndianPhone(once)).toBe(once)
  })
})

describe('formatPhoneForDisplay', () => {
  it('groups Indian mobiles 5+5', () => {
    expect(formatPhoneForDisplay(E164)).toBe('+91 99999 00001')
  })

  it('formats non-Indian numbers internationally', () => {
    expect(formatPhoneForDisplay('+16505550100')).toBe('+1 650 555 0100')
  })

  it('returns empty string for empty input and passes through junk', () => {
    expect(formatPhoneForDisplay('')).toBe('')
    expect(formatPhoneForDisplay(null)).toBe('')
    expect(formatPhoneForDisplay(undefined)).toBe('')
    expect(formatPhoneForDisplay('not a number')).toBe('not a number')
  })
})

describe('maskPhone', () => {
  it('keeps the country code and the last four digits', () => {
    expect(maskPhone(E164)).toBe('+91 ••••• •0001')
  })

  it('returns empty string for empty input', () => {
    expect(maskPhone(null)).toBe('')
  })
})
