export const MAX_INPUT_BYTES = 2 * 1024 * 1024
export const MAX_INPUT_LINES = 50_000

export function normalizeInput(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
}
export function validateInput(text: string): string | undefined {
  if (!text.trim()) return 'Вставьте вывод команды или загрузите пример.'
  if (new TextEncoder().encode(text).length > MAX_INPUT_BYTES)
    return 'Текст превышает лимит 2 MiB. Выберите меньший файл.'
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    if (code < 32 && ![9, 10, 12, 13].includes(code))
      return 'Обнаружены бинарные данные. Нужен текстовый вывод команды.'
  }
  if (text.split('\n').length > MAX_INPUT_LINES)
    return 'В тексте более 50 000 строк. Разделите вывод на несколько файлов.'
  return undefined
}
