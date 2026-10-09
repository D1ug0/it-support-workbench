import { describe, it, expect } from 'vitest'
import { decodeText, readTextFile } from './readTextFile'
import { MAX_INPUT_BYTES } from '../parser/normalizeInput'

describe('local file decoding', () => {
  it('decodes UTF8 BOM and CRLF', () => {
    expect(decodeText(new TextEncoder().encode('\uFEFFПример\r\nВывод'), 'utf-8')).toBe(
      'Пример\nВывод',
    )
  })
  it('decodes legacy RU encodings', () => {
    expect(
      decodeText(new Uint8Array([0xc0, 0xe4, 0xe0, 0xef, 0xf2, 0xe5, 0xf0]), 'windows-1251'),
    ).toBe('Адаптер')
    expect(decodeText(new Uint8Array([0x80, 0xa4, 0xa0, 0xaf, 0xe2, 0xa5, 0xe0]), 'ibm866')).toBe(
      'Адаптер',
    )
  })
  it('rejects binary, empty, too large and broken UTF8', () => {
    expect(() => decodeText(new Uint8Array([0]), 'utf-8')).toThrow()
    expect(() => decodeText(new Uint8Array([255]), 'utf-8')).toThrow('кодиров')
    expect(() => decodeText(new Uint8Array(MAX_INPUT_BYTES + 1), 'utf-8')).toThrow('2 MiB')
    expect(() => decodeText(new Uint8Array(), 'utf-8')).toThrow()
  })
  it('checks extension and size before reading', async () => {
    await expect(readTextFile(new File(['hello'], 'data.html'))).rejects.toThrow('.txt')
    await expect(
      readTextFile(new File(['x'.repeat(MAX_INPUT_BYTES + 1)], 'data.txt')),
    ).rejects.toThrow('2 MiB')
    expect(await readTextFile(new File(['hello'], 'data.LOG'))).toBe('hello')
  })
})
