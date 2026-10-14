import { describe, expect, it } from 'vitest'
import { parseDecimalCounter } from './numbers'

describe('unsigned output counters', () => {
  it.each([
    ['0', 0],
    ['00025', 25],
    ['4294967295', 4294967295],
  ] as const)('reads decimal %s', (text, expected) => {
    expect(parseDecimalCounter(text)).toBe(expected)
  })
  it.each([
    '',
    ' ',
    '-1',
    '+1',
    '1.5',
    '0x10',
    '1e3',
    'NaN',
    'Infinity',
    '4294967296',
    '9'.repeat(400),
  ])('rejects unsupported or out-of-range %s', (text) =>
    expect(parseDecimalCounter(text)).toBeUndefined(),
  )
  it('checks a narrower field limit', () => {
    expect(parseDecimalCounter('128', 128)).toBe(128)
    expect(parseDecimalCounter('129', 128)).toBeUndefined()
  })
})
