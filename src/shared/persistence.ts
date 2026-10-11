export type SaveResult = { status: 'saved' | 'memory' } | { status: 'failed'; error: string }
export function saveNotice(result: SaveResult, saved: string) {
  return result.status === 'failed'
    ? result.error
    : result.status === 'saved'
      ? saved
      : 'Результат в памяти вкладки. Включите сохранение или экспортируйте данные перед закрытием.'
}
