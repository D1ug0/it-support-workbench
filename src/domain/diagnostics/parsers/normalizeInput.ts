export const MAX_INPUT_BYTES = 2 * 1024 * 1024
export const MAX_INPUT_LINES = 50_000

export function normalizeInput(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
}
export function validateInput(text: string): string | undefined {
  if (!text.trim()) return 'Вставьте вывод команды или загрузите пример.'
  // Every UTF-16 code unit contributes at least one UTF-8 byte.
  if (text.length > MAX_INPUT_BYTES) return 'Текст превышает лимит 2 MiB. Выберите меньший файл.'
  let bytes = 0
  let lines = 1
  let binary = false
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    if (code < 32 && code !== 9 && code !== 10 && code !== 12 && code !== 13) binary = true
    if (code === 10) lines++
    if (code < 0x80) bytes++
    else if (code < 0x800) bytes += 2
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      text.charCodeAt(index + 1) >= 0xdc00 &&
      text.charCodeAt(index + 1) <= 0xdfff
    ) {
      bytes += 4
      index++
    } else {
      // Unpaired surrogates become the three-byte replacement character, as in TextEncoder.
      bytes += 3
    }
    if (bytes > MAX_INPUT_BYTES) return 'Текст превышает лимит 2 MiB. Выберите меньший файл.'
  }
  if (binary) return 'Обнаружены бинарные данные. Нужен текстовый вывод команды.'
  if (lines > MAX_INPUT_LINES)
    return 'В тексте более 50 000 строк. Разделите вывод на несколько файлов.'
  return undefined
}
