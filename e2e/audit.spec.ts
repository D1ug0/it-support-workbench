import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
async function put(page: Page, name: string, table: string, values: unknown[]) {
  await page.evaluate(
    async ({ name, table, values }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open(name)
        r.onupgradeneeded = () => {
          if (!r.result.objectStoreNames.contains(table))
            r.result.createObjectStore(table, { keyPath: 'id' })
        }
        r.onsuccess = () => resolve(r.result)
        r.onerror = () => reject(r.error)
      })
      try {
        await new Promise<void>((resolve, reject) => {
          const t = db.transaction(table, 'readwrite')
          for (const v of values) t.objectStore(table).put(v)
          t.oncomplete = () => resolve()
          t.onabort = () => reject(t.error)
        })
      } finally {
        db.close()
      }
    },
    { name, table, values },
  )
}
async function rows(page: Page, name: string, table: string) {
  return page.evaluate(
    async ({ name, table }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open(name)
        r.onsuccess = () => resolve(r.result)
        r.onerror = () => reject(r.error)
      })
      try {
        return await new Promise<unknown[]>((resolve, reject) => {
          const r = db.transaction(table).objectStore(table).getAll()
          r.onsuccess = () => resolve(r.result)
          r.onerror = () => reject(r.error)
        })
      } finally {
        db.close()
      }
    },
    { name, table },
  )
}
async function settings(page: Page) {
  await page.goto('/#/settings')
  await expect(
    page.getByRole('heading', { name: 'Ваше рабочее место.', exact: true }),
  ).toBeVisible()
  await page.getByLabel('Проверил учебную копию: в заметках нет чувствительных данных').check()
}
async function backup(page: Page) {
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать общую учебную копию', exact: true }).click()
  return JSON.parse(await readFile((await (await event).path())!, 'utf8'))
}
test('valid backup can recover corrupt current and legacy progress without deleting the legacy recovery evidence', async ({
  page,
}) => {
  await settings(page)
  const valid = await backup(page)
  const broken = {
    id: 'progress',
    enabled: true,
    state: { schemaVersion: 999, marker: 'BROKEN-LEARNING' },
    revision: 1,
  }
  await put(page, 'it-support-workbench-workshop', 'baseProgress', [broken])
  await put(page, 'it-support-workbench-learning', 'progress', [broken])
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Ваше рабочее место.' })).toBeVisible()
  await page.getByLabel('Проверил учебную копию: в заметках нет чувствительных данных').check()
  await page.getByLabel('Открыть общую учебную копию', { exact: true }).setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(valid)),
  })
  await expect(page.getByRole('heading', { name: 'Предпросмотр восстановления' })).toBeVisible()
  expect(await rows(page, 'it-support-workbench-learning', 'progress')).toEqual([broken])
  const recoveryEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать исходные записи для восстановления' }).click()
  const raw = JSON.parse(await readFile((await (await recoveryEvent).path())!, 'utf8'))
  expect(raw.legacyProgress[0].state.marker).toBe('BROKEN-LEARNING')
  await page
    .getByLabel('Подтверждаю замену учебных коллекций; текущую копию сохранил при необходимости')
    .check()
  await page.getByRole('button', { name: 'Восстановить общую учебную копию', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Учебная копия восстановлена целиком' }),
  ).toBeVisible()
  expect(await rows(page, 'it-support-workbench-learning', 'progress')).toEqual([broken])
  expect(
    JSON.stringify(await rows(page, 'it-support-workbench-workshop', 'baseProgress')),
  ).not.toContain('BROKEN-LEARNING')
})
const scenario = {
  schemaVersion: 1,
  id: 'USR-00000000-0000-4000-8000-000000000019',
  title: 'Старый авторский инцидент',
  category: 'DNS',
  difficulty: 'Средний',
  brief: 'Учебный симптом для восстановления.',
  context: 'Вымышленный стенд lab.example',
  resolution: 'Подтверждённая учебная причина.',
  steps: [
    {
      id: 'step',
      question: 'Какую проверку выполнить?',
      recommendedId: 'check',
      choices: [
        {
          id: 'check',
          label: 'Проверить DNS',
          result: 'Учебный ответ',
          explanation: 'Уточняет причину',
          safe: true,
        },
        {
          id: 'guess',
          label: 'Угадать причину',
          result: 'Недостаточно данных',
          explanation: 'Требуется проверка',
          safe: true,
        },
      ],
    },
  ],
}
test('legacy authoring migration includes linear scenarios and preserves conflicting originals', async ({
  page,
}) => {
  await settings(page)
  await put(page, 'it-support-workbench-scenarios', 'scenarios', [scenario])
  // A clean browser may already have completed an empty migration; model an older profile before migration.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((r) => {
      const q = indexedDB.open('it-support-workbench-workshop')
      q.onsuccess = () => r(q.result)
    })
    await new Promise<void>((r) => {
      const t = db.transaction('metadata', 'readwrite')
      t.objectStore('metadata').delete('scenario-migration')
      t.oncomplete = () => r()
    })
    db.close()
  })
  const first = await backup(page)
  expect(first.schemaVersion).toBe(2)
  expect(first.scenarios).toEqual([scenario])
  expect(await rows(page, 'it-support-workbench-scenarios', 'scenarios')).toEqual([scenario])
  await put(page, 'it-support-workbench-workshop', 'scenarios', [
    { ...scenario, title: 'Новая версия с тем же ID' },
    { id: 'broken', marker: 'BROKEN-SCENARIO' },
  ])
  await page.goto('/#/simulator?view=editor')
  await expect(page.getByText('Новая версия с тем же ID', { exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Конфликт ID')
  expect(await rows(page, 'it-support-workbench-scenarios', 'scenarios')).toEqual([scenario])
})
test('report editing keeps one ID, drafts survive reload, and unsaved changes block leaving', async ({
  page,
}) => {
  await page.goto('/#/terminal?lab=TERM-DNS-SERVER')
  await page.getByLabel('Симптом', { exact: true }).fill('Учебный портал не открывается по имени.')
  const dialog = page.waitForEvent('dialog')
  const click = page.getByRole('link', { name: 'Настройки', exact: true }).click()
  const prompt = await dialog
  expect(prompt.message()).toContain('несохранённые')
  await prompt.dismiss()
  await click
  await expect(page.getByLabel('Симптом', { exact: true })).toHaveValue(
    'Учебный портал не открывается по имени.',
  )
  await page.getByLabel('Проверил заметки: здесь только учебные данные').check()
  await page.getByRole('button', { name: 'Сохранить учебный черновик', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Черновик сохранён вручную' }),
  ).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Продолжить сохранённый черновик')).toBeVisible()
  const draftOption = page.getByLabel('Продолжить сохранённый черновик').locator('option').nth(1)
  await page
    .getByLabel('Продолжить сохранённый черновик')
    .selectOption((await draftOption.getAttribute('value'))!)
  await expect(page.getByLabel('Симптом', { exact: true })).toHaveValue(
    'Учебный портал не открывается по имени.',
  )
  await page.getByLabel('Проверил заметки: здесь только учебные данные').check()
  await page.getByRole('button', { name: 'Сохранить в портфолио', exact: true }).click()
  await page.getByLabel('Гипотеза', { exact: true }).fill('Сравнить кэш с прямым ответом DNS.')
  await page.getByRole('button', { name: 'Сохранить в портфолио', exact: true }).click()
  const reports = (await rows(page, 'it-support-workbench-workshop', 'reports')) as Array<{
    status: string
    version: number
  }>
  expect(reports).toHaveLength(1)
  expect(reports[0]).toMatchObject({ status: 'draft', version: 2 })
})
test('professional incident saves one concrete attempt and continues after reload', async ({
  page,
}) => {
  await page.goto('/#/learning?view=workshop&workshop=professional&incident=portal')
  await expect(
    page.getByRole('heading', { name: 'Сквозные профессиональные инциденты' }),
  ).toBeVisible()
  for (const action of ['clarify', 'scope', 'dns', 'repair:cache', 'verify']) {
    await page.getByLabel('Следующая проверка или действие').selectOption(action)
    await page.getByLabel('Гипотеза и обоснование').fill('Проверяю учебную гипотезу по фактам.')
    await page.getByRole('button', { name: 'Выполнить учебное действие' }).click()
  }
  await page.getByRole('button', { name: 'Завершить инцидент по целям' }).click()
  await expect(page.getByRole('alert')).toContainText('Не выполнены цели')
  await page.getByLabel('Проверил заметки: только учебные данные').check()
  await page.getByRole('button', { name: 'Сохранить попытку инцидента', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Конкретная попытка сохранена' }),
  ).toBeVisible()
  const old = await rows(page, 'it-support-workbench-workshop', 'professionalAttempts')
  await page.reload()
  await page.getByRole('button', { name: 'Продолжить попытку portal' }).click()
  await expect(
    page.getByText('Пользовательский запрос всё ещё не проходит.', { exact: false }),
  ).toBeVisible()
  expect(await rows(page, 'it-support-workbench-workshop', 'professionalAttempts')).toEqual(old)
})
