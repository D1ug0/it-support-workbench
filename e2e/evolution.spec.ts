import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
async function openWorkshop(page: Page, tab: string) {
  await page.goto(`/#/learning?view=workshop&workshop=${tab}`)
  await expect(page.getByRole('heading', { name: 'Практикум развития', exact: true })).toBeVisible()
}
async function createCourse(page: Page, title: string) {
  await openWorkshop(page, 'course-editor')
  await page.getByLabel('Название авторского курса', { exact: true }).fill(title)
  await page.getByLabel('Подтверждаю авторский учебный материал без чувствительных данных').check()
  await page.getByRole('button', { name: 'Сохранить авторский курс', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Авторские курсы сохранены' }),
  ).toBeVisible()
}
test('visual course and graph constructors produce persistent usable content', async ({ page }) => {
  await createCourse(page, 'Курс из визуального конструктора')
  await page.getByLabel('Название авторского курса', { exact: true }).fill('')
  await page
    .getByLabel('Название авторского курса', { exact: true })
    .pressSequentially('Курс из визуального конструктора')
  await expect(page.getByLabel('Название авторского курса', { exact: true })).toHaveValue(
    'Курс из визуального конструктора',
  )
  await page.getByRole('button', { name: 'Добавить абзац', exact: true }).click()
  await page
    .getByLabel('Абзац 4', { exact: true })
    .fill('Проверьте исходный отказ, исправьте одну причину и подтвердите результат.')
  await page.getByRole('button', { name: 'Сохранить авторский курс', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Авторские курсы сохранены' }),
  ).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Редактировать курс', exact: true }).click()
  await expect(page.getByLabel('Название авторского курса', { exact: true })).toHaveValue(
    'Курс из визуального конструктора',
  )
  await expect(page.getByLabel('Абзац 4', { exact: true })).toHaveValue(
    'Проверьте исходный отказ, исправьте одну причину и подтвердите результат.',
  )
  await openWorkshop(page, 'graphs')
  await page
    .getByLabel('Название расследования', { exact: true })
    .fill('Моё визуальное расследование')
  await page.getByRole('button', { name: 'Добавить этап расследования', exact: true }).click()
  await page
    .getByLabel('Условие этапа', { exact: true })
    .fill('Вы проверили сервис. Как подтвердить устранение отказа приложения?')
  await page.getByLabel('Сценарий содержит только учебные данные').check()
  await page.getByRole('button', { name: 'Сохранить граф', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Сценарий сохранён' })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Открыть граф', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Схема переходов' })).toContainText('step-1')
  await page.setViewportSize({ width: 375, height: 812 })
  expect(
    (await new AxeBuilder({ page }).analyze()).violations.filter((v) =>
      ['serious', 'critical'].includes(v.impact ?? ''),
    ),
  ).toEqual([])
})
test('complete backup restores atomically, rejects changed previews and keeps automatic saving off', async ({
  page,
}) => {
  await createCourse(page, 'Курс до восстановления')
  await page.goto('/#/settings')
  await page.getByLabel('Проверил учебную копию: в заметках нет чувствительных данных').check()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать общую учебную копию', exact: true }).click()
  const download = await downloading,
    path = await download.path()
  const original = JSON.parse(await readFile(path!, 'utf8'))
  expect(original.courses).toHaveLength(1)
  expect(original).not.toHaveProperty('raw')
  const incoming = {
    ...original,
    courses: [{ ...original.courses[0], title: 'Курс после восстановления' }],
  }
  const file = {
    name: 'learning-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(incoming)),
  }
  await page.getByLabel('Открыть общую учебную копию', { exact: true }).setInputFiles(file)
  await expect(page.getByRole('heading', { name: 'Предпросмотр восстановления' })).toBeVisible()
  // Simulate another tab writing after preview. Restore must not erase its entry.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('it-support-workbench-workshop')
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction('settings', 'readwrite')
      t.objectStore('settings').put({ id: 'other-tab-marker', value: 'retained' })
      t.oncomplete = () => resolve()
      t.onabort = () => reject(t.error)
    })
    db.close()
  })
  await page
    .getByLabel('Подтверждаю замену учебных коллекций; текущую копию сохранил при необходимости')
    .check()
  await page.getByRole('button', { name: 'Восстановить общую учебную копию', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Данные изменились после предпросмотра')
  await page.getByLabel('Открыть общую учебную копию', { exact: true }).setInputFiles(file)
  await expect(page.getByRole('heading', { name: 'Предпросмотр восстановления' })).toBeVisible()
  await page
    .getByLabel('Подтверждаю замену учебных коллекций; текущую копию сохранил при необходимости')
    .check()
  // Abort late in the transaction, after content collections were replaced.
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'baseProgress') {
        this.transaction.abort()
        IDBObjectStore.prototype.put = original
      }
      return original.apply(this, args)
    }
  })
  await page.getByRole('button', { name: 'Восстановить общую учебную копию', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.reload()
  await openWorkshop(page, 'course-editor')
  await expect(page.getByText('Курс до восстановления', { exact: true })).toBeVisible()
  await expect(page.getByText('Курс после восстановления', { exact: true })).toHaveCount(0)
  await page.goto('/#/settings')
  await page.getByLabel('Проверил учебную копию: в заметках нет чувствительных данных').check()
  await page.getByLabel('Открыть общую учебную копию', { exact: true }).setInputFiles(file)
  await expect(page.getByRole('heading', { name: 'Предпросмотр восстановления' })).toBeVisible()
  await page
    .getByLabel('Подтверждаю замену учебных коллекций; текущую копию сохранил при необходимости')
    .check()
  await page.getByRole('button', { name: 'Восстановить общую учебную копию', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Учебная копия восстановлена целиком' }),
  ).toBeVisible()
  await openWorkshop(page, 'course-editor')
  await expect(page.getByText('Курс после восстановления', { exact: true })).toBeVisible()
  await expect(
    page.getByLabel('Сохранять навыки и результаты практикума на устройстве', { exact: true }),
  ).not.toBeChecked()
  await page.reload()
  await expect(page.getByText('Курс после восстановления', { exact: true })).toBeVisible()
})
test('multi-host incident requires full service verification and explains a wrong change', async ({
  page,
}) => {
  await page.goto('/#/terminal?lab=TERM-FLEET')
  await page.getByLabel('Простой ввод и текстовый вывод').check()
  async function run(command: string) {
    await page.getByLabel('Команда учебного терминала', { exact: true }).fill(command)
    await page.getByRole('button', { name: 'Выполнить в учебной среде', exact: true }).click()
    await expect(page.locator('.terminal-records li').first()).toContainText(command)
  }
  for (const command of [
    'lab hosts',
    'lab verify-fleet',
    'Set-DnsClientServerAddress -InterfaceIndex 12 -ServerAddresses 192.0.2.54',
  ])
    await run(command)
  await page
    .locator('.terminal-records li')
    .first()
    .getByText(/Разбор действия/)
    .click()
  await expect(
    page.getByRole('heading', { name: 'Изменение добавило неисправность', exact: true }),
  ).toBeVisible()
  await run('Set-DnsClientServerAddress -InterfaceIndex 12 -ServerAddresses 192.0.2.53')
  for (const command of [
    'lab repair pc-2 dns',
    'lab repair web-2 service',
    'lab repair api http',
    'Restart-Service WebApp',
    'ipconfig /flushdns',
    'lab verify-fleet',
  ])
    await run(command)
  await expect(page.locator('.terminal-records li').first()).toContainText(
    'pc-2 → api: HTTPS: 200 OK',
  )
  await page
    .getByLabel('Несколько независимых неисправностей клиента и серверов', { exact: true })
    .check()
  await page.getByRole('button', { name: 'Проверить решение', exact: true }).click()
  await expect(page.locator('.terminal-feedback')).toContainText('Попытка завершена')
})
test('stand workflow saves only explicit notes and preserves older learning during migration', async ({
  page,
}) => {
  await page.goto('/#/settings')
  await expect(page.getByRole('heading', { name: 'Ваше рабочее место.' })).toBeVisible()
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('it-support-workbench-learning', 10)
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains('progress'))
          r.result.createObjectStore('progress', { keyPath: 'id' })
      }
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction('progress', 'readwrite')
      t.objectStore('progress').put({
        id: 'progress',
        enabled: true,
        state: {
          schemaVersion: 1,
          answers: { 'legacy-question': { attempts: 2, correct: 1, lastCorrect: true } },
          scenarios: {},
        },
      })
      t.oncomplete = () => resolve()
      t.onabort = () => reject(t.error)
    })
    db.close()
  })
  await page.reload()
  await page.getByLabel('Проверил учебную копию: в заметках нет чувствительных данных').check()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать общую учебную копию', exact: true }).click()
  const path = await (await downloading).path(),
    backup = JSON.parse(await readFile(path!, 'utf8'))
  expect(backup.learning.answers['legacy-question'].attempts).toBe(2)
  await openWorkshop(page, 'stand')
  await page.getByLabel('Работаю в собственном разрешённом учебном окружении').check()
  await page.getByLabel('Учебное окружение изолировано от рабочих систем').check()
  await page.getByLabel('Подготовил снимок или копию и способ восстановления').check()
  for (const [label, text] of [
    ['ОС, версия и локаль стенда', 'Учебная Windows 11 RU'],
    ['Симптом стенда', 'Имя портала не разрешалось'],
    ['Гипотеза стенда', 'DNS клиента не соответствует плану'],
    ['Изменение на стенде', 'Указан DNS учебной сети'],
    ['Повторная проверка на стенде', 'HTTPS подтвердил работу приложения'],
    ['Самостоятельное объяснение', 'Прямой запрос к DNS не меняет настройки адаптера.'],
  ])
    await page.getByLabel(label!, { exact: true }).fill(text!)
  await expect(
    page.getByRole('button', { name: 'Сохранить отчёт стенда', exact: true }),
  ).toBeDisabled()
  await page.getByLabel('Проверил отчёт стенда: только обезличенные учебные заметки').check()
  await page.getByRole('button', { name: 'Сохранить отчёт стенда', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Отчёт стенда сохранён' })).toBeVisible()
  await page.reload()
  await page.getByText('Отчёты стенда (1/50)', { exact: true }).click()
  await expect(
    page
      .locator('.workshop-report-preview')
      .filter({ hasText: 'HTTPS подтвердил работу приложения' }),
  ).toBeVisible()
})
