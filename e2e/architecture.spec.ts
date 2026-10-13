import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import { chooseOption } from './helpers/select'

type Row = {
  id: string
  storageToken?: string | null
  notes?: Record<string, string>
  enabled?: boolean
}
async function rows(page: Page, table: string): Promise<Row[]> {
  return page.evaluate(
    (table) =>
      new Promise<Row[]>((resolve, reject) => {
        const request = indexedDB.open('it-support-workbench-workshop')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const transaction = db.transaction(table)
          const query = transaction.objectStore(table).getAll()
          query.onsuccess = () => resolve(query.result)
          query.onerror = () => reject(query.error)
          transaction.oncomplete = () => db.close()
        }
      }),
    table,
  )
}
async function saveDraft(page: Page, symptom: string) {
  await page.goto('/#/terminal?lab=TERM-DNS-SERVER')
  await page.getByLabel('Симптом и масштаб', { exact: true }).fill(symptom)
  await page.getByLabel('Проверил заметки: здесь только учебные данные').check()
  await page.getByRole('button', { name: 'Сохранить учебный черновик', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Черновик сохранён вручную' }),
  ).toBeVisible()
}

test('session repository preserves a rejected draft from another IndexedDB tab', async ({
  page,
  context,
}) => {
  await page.goto('/#/terminal?lab=TERM-DNS-SERVER')
  await page.getByLabel('Симптом и масштаб', { exact: true }).fill('Исходный учебный черновик.')
  expect(await rows(page, 'drafts')).toEqual([])
  await page.getByLabel('Проверил заметки: здесь только учебные данные').check()
  await page.getByRole('button', { name: 'Сохранить учебный черновик', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Черновик сохранён вручную' }),
  ).toBeVisible()
  const initial = (await rows(page, 'drafts'))[0]!
  const second = await context.newPage()
  await second.goto(page.url())
  await chooseOption(second, second.getByLabel('Продолжить сохранённый черновик'), initial.id)
  await expect(second.getByLabel('Симптом и масштаб', { exact: true })).toHaveValue(
    'Исходный учебный черновик.',
  )
  await page
    .getByLabel('Симптом и масштаб', { exact: true })
    .fill('Обновлённый текст первой вкладки.')
  await page.getByRole('button', { name: 'Сохранить учебный черновик', exact: true }).click()
  await expect
    .poll(async () => (await rows(page, 'drafts'))[0]?.notes?.symptom)
    .toBe('Обновлённый текст первой вкладки.')
  await second.getByLabel('Гипотеза', { exact: true }).fill('Локальный текст второй вкладки.')
  await second.getByLabel('Проверил заметки: здесь только учебные данные').check()
  await second.getByRole('button', { name: 'Сохранить учебный черновик', exact: true }).click()
  await expect(second.getByRole('alert')).toContainText('другой вкладке')
  await expect(second.getByLabel('Гипотеза', { exact: true })).toHaveValue(
    'Локальный текст второй вкладки.',
  )
  expect((await rows(page, 'drafts'))[0]?.notes?.symptom).toBe('Обновлённый текст первой вкладки.')
  await second.close()
})

test('backup restores session records and disables previously enabled progress persistence', async ({
  page,
}) => {
  await page.goto('/#/learning?view=workshop&workshop=baseline')
  await page.getByLabel('Сохранять навыки и результаты практикума на устройстве').check()
  await expect
    .poll(async () => (await rows(page, 'settings')).find((row) => row.id === 'progress')?.enabled)
    .toBe(true)
  await saveDraft(page, 'Учебный портал недоступен по имени.')
  const original = (await rows(page, 'drafts'))[0]!
  await page.goto('/#/settings')
  await page.getByLabel('Проверил учебную копию: в заметках нет чувствительных данных').check()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать общую учебную копию', exact: true }).click()
  const download = await downloading
  const text = await readFile((await download.path())!, 'utf8')
  expect(JSON.parse(text)).toMatchObject({
    format: 'it-workbench-learning-backup',
    schemaVersion: 2,
    drafts: [{ id: original.id, notes: { symptom: 'Учебный портал недоступен по имени.' } }],
  })
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('it-support-workbench-workshop')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result,
            transaction = db.transaction('drafts', 'readwrite')
          transaction.objectStore('drafts').clear()
          transaction.oncomplete = () => {
            db.close()
            resolve()
          }
          transaction.onabort = () => reject(transaction.error)
        }
      }),
  )
  expect(await rows(page, 'drafts')).toEqual([])
  await page.getByLabel('Открыть общую учебную копию').setInputFiles({
    name: 'learning-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  })
  await expect(page.getByRole('heading', { name: 'Предпросмотр восстановления' })).toBeVisible()
  await page
    .getByLabel('Подтверждаю замену учебных коллекций; текущую копию сохранил при необходимости')
    .check()
  await page.getByRole('button', { name: 'Восстановить общую учебную копию', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Учебная копия восстановлена целиком' }),
  ).toBeVisible()
  const restored = (await rows(page, 'drafts'))[0]!
  expect(restored.id).toBe(original.id)
  expect(restored.notes).toEqual(original.notes)
  expect(restored.storageToken).not.toBe(original.storageToken)
  expect((await rows(page, 'settings')).find((row) => row.id === 'progress')?.enabled).toBe(false)
  expect((await rows(page, 'baseProgress')).find((row) => row.id === 'progress')?.enabled).toBe(
    false,
  )
})
