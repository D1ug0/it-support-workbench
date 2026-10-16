import { describe, expect, it } from 'vitest'
import { MAX_INPUT_BYTES, MAX_INPUT_LINES, normalizeInput, validateInput } from './normalizeInput'

describe('diagnostic input limits', () => {
  it.each(['a', 'я', '界', '😀', '\ud800', '\udc00'])('counts UTF-8 bytes for %j', (character) => {
    const width = new TextEncoder().encode(character).length
    const text = character.repeat(Math.floor(MAX_INPUT_BYTES / width))
    expect(validateInput(text)).toBeUndefined()
    expect(validateInput(text + character)).toContain('2 MiB')
  })

  it('handles adjacent surrogate pairs and isolated surrogates at the exact byte limit', () => {
    const suffix = 'я界😀\ud800x\udc00😀'
    const width = new TextEncoder().encode(suffix).length
    const text = 'x'.repeat(MAX_INPUT_BYTES - width) + suffix
    expect(validateInput(text)).toBeUndefined()
    expect(validateInput(text + 'x')).toContain('2 MiB')
  })

  it('counts the trailing empty line and normalizes Windows line endings', () => {
    const text = normalizeInput('\uFEFF' + 'x\r\n'.repeat(MAX_INPUT_LINES - 1) + 'x')
    expect(validateInput(text)).toBeUndefined()
    expect(validateInput(text + '\n')).toContain('50 000')
    expect(normalizeInput('a\rb\r\nc')).toBe('a\nb\nc')
  })

  it('preserves error priority for empty, oversized, binary and multiline input', () => {
    expect(validateInput(' \t\n')).toContain('Вставьте')
    expect(validateInput('\0' + 'я'.repeat(MAX_INPUT_BYTES / 2))).toContain('2 MiB')
    expect(validateInput('\0' + 'x\n'.repeat(MAX_INPUT_LINES))).toContain('бинарные')
    expect(validateInput('text\t\f\r\n')).toBeUndefined()
    for (const code of [0, 1, 8, 11, 14, 31])
      expect(validateInput('text' + String.fromCharCode(code))).toContain('бинарные')
  })
})
