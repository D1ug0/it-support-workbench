import { expect, it } from 'vitest'
import { matchesSearch } from './search'
it('finds common symptoms and abbreviations without matching unrelated topics', () => {
  expect(matchesSearch('TLS: сертификат портала', 'не открывается сайт')).toBe(true)
  expect(matchesSearch('Wi-Fi: подключение', 'вайфай')).toBe(true)
  expect(matchesSearch('Git: конфликт веток', 'ГИТ')).toBe(true)
  expect(matchesSearch('DNS', 'днс')).toBe(true)
  expect(matchesSearch('Восстановление сервиса', 'бэкап')).toBe(true)
  expect(matchesSearch('Гит и CI', 'не открывается сайт')).toBe(false)
  expect(matchesSearch('Рабочая сессия', '  ')).toBe(true)
})
