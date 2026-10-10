import { MAX_INPUT_BYTES, normalizeInput, validateInput } from '../parser/normalizeInput'
export type FileEncoding = 'utf-8' | 'windows-1251' | 'ibm866'

export function decodeText(bytes: Uint8Array, encoding: FileEncoding): string {
  if (bytes.byteLength > MAX_INPUT_BYTES) throw new Error('Файл превышает лимит 2 MiB.')
  let text: string
  try {
    text = new TextDecoder(encoding, { fatal: true }).decode(bytes)
  } catch {
    throw new Error('Ошибка кодировки. Выберите Windows-1251 или CP866 и повторите чтение.')
  }
  const normalized = normalizeInput(text)
  const error = validateInput(normalized)
  if (error) throw new Error(error)
  return normalized
}
export async function readTextFile(file: File, encoding: FileEncoding = 'utf-8'): Promise<string> {
  if (!/\.(txt|log|json)$/i.test(file.name))
    throw new Error('Поддерживаются файлы .txt, .log и .json.')
  if (file.size > MAX_INPUT_BYTES) throw new Error('Файл превышает лимит 2 MiB.')
  return decodeText(new Uint8Array(await file.arrayBuffer()), encoding)
}
