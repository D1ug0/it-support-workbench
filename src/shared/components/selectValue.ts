export type SelectValue = string | number | null

// Encode every value: Reka reserves the empty string, while our forms use both '' and null.
export function encodeSelectValue(value: SelectValue): string {
  return JSON.stringify(value)
}
export function decodeSelectValue(value: string): SelectValue {
  const decoded: unknown = JSON.parse(value)
  if (decoded === null || typeof decoded === 'string' || typeof decoded === 'number') return decoded
  throw new Error('Unsupported select value')
}
