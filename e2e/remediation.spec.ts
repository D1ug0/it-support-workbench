import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import type { WorkshopProgress } from '../src/features/workshop/skills'

const saveLabel = 'Сохранять навыки и результаты практикума на устройстве'
const continuation = (page: Page) =>
  page.getByRole('region', { name: 'Продолжить обучение', exact: true })
const training = (page: Page) =>
  page.getByRole('region', { name: 'Короткая тренировка ошибки', exact: true })
async function progress(page: Page): Promise<WorkshopProgress> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('it-support-workbench-workshop')
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    try {
      return await new Promise((resolve, reject) => {
        const r = db.transaction('settings').objectStore('settings').get('progress')
        r.onsuccess = () => resolve(r.result.value)
        r.onerror = () => reject(r.error)
      })
    } finally {
      db.close()
    }
  })
}
async function assign(page: Page, enabled = true) {
  await page.goto('/#/learning?view=workshop&lesson=DNS')
  await expect(
    page.getByRole('heading', { name: 'DNS: сервер, кэш и тип записи', exact: true }),
  ).toBeVisible()
  if (enabled) await page.getByLabel(saveLabel, { exact: true }).check()
  await page.getByRole('button', { name: 'Случайный TCP-порт', exact: true }).click()
  await expect(
    continuation(page).getByRole('link', { name: 'Открыть сегодняшнюю задачу' }),
  ).toHaveAttribute('href', '#/learning?view=workshop&workshop=error-practice&error=dns-cache')
  await continuation(page).getByRole('link', { name: 'Открыть сегодняшнюю задачу' }).click()
  await expect(training(page)).toContainText('Причина назначения: ошибка в задании')
  await training(page).getByRole('button', { name: 'Начать короткое занятие', exact: true }).click()
  await expect(training(page).getByRole('article', { name: 'Текущая задача' })).toBeVisible()
}
async function completePractice(page: Page) {
  await training(page)
    .getByRole('button', {
      name: 'Два пути разрешения дали разные адреса; источник расхождения ещё нужно установить',
      exact: true,
    })
    .click()
  await training(page).getByRole('button', { name: 'К выбору доказательства', exact: true }).click()
  await training(page)
    .getByRole('button', {
      name: 'Сопоставить запись ipconfig /displaydns, DNS интерфейса и прямой ответ для того же имени и типа',
      exact: true,
    })
    .click()
  await expect(training(page)).toContainText('Активное назначение закрыто')
  await expect(training(page)).toContainText('Ответы сохранены на устройстве')
}
test('DNS error practice persists first answers, closes the assignment and round-trips through the backup', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-11T12:00:00Z'))
  await assign(page)
  await training(page)
    .getByRole('button', {
      name: 'Два пути разрешения дали разные адреса; источник расхождения ещё нужно установить',
      exact: true,
    })
    .click()
  await expect(training(page)).toContainText('Ответы сохранены на устройстве')
  const stored = await progress(page)
  expect(stored.remediationAttempts[0]?.answers).toHaveLength(1)
  expect(stored.events[0]?.errorIds).toEqual(['dns-cache'])
  await page.reload()
  await expect(training(page)).toContainText('2 из 2')
  await training(page)
    .getByRole('button', {
      name: 'Сопоставить запись ipconfig /displaydns, DNS интерфейса и прямой ответ для того же имени и типа',
      exact: true,
    })
    .click()
  await expect(training(page)).toContainText('Активное назначение закрыто')
  await expect(continuation(page)).toContainText('Проверка после перерыва')
  await expect(
    continuation(page).getByRole('link', { name: 'Открыть сегодняшнюю задачу' }),
  ).not.toHaveAttribute('href', /error-practice/)
  const done = await progress(page)
  expect(done.attempts).toHaveLength(0)
  expect(done.theoryChecks).toHaveLength(1)
  expect(done.events).toHaveLength(2)
  expect(done.events[1]).toMatchObject({
    score: 100,
    outcome: 'completed',
    taskId: 'FIX-v1-dns-cache-practice',
  })
  await page.goto('/#/settings')
  await page.getByLabel('Проверил учебную копию: в заметках нет чувствительных данных').check()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать общую учебную копию', exact: true }).click()
  const buffer = await readFile((await (await downloading).path())!)
  expect(JSON.parse(buffer.toString()).workshop.remediationAttempts).toEqual(
    done.remediationAttempts,
  )
  await page
    .getByLabel('Открыть общую учебную копию', { exact: true })
    .setInputFiles({ name: 'learning-backup.json', mimeType: 'application/json', buffer })
  await expect(page.getByRole('row').filter({ hasText: 'Короткие занятия ошибок' })).toContainText(
    '1',
  )
  await page
    .getByLabel('Подтверждаю замену учебных коллекций; текущую копию сохранил при необходимости')
    .check()
  await page.getByRole('button', { name: 'Восстановить общую учебную копию', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Учебная копия восстановлена целиком' }),
  ).toBeVisible()
  await page.goto('/#/learning?view=workshop&workshop=error-practice&error=dns-cache')
  await expect(training(page)).toContainText('Активное назначение закрыто')
  await expect(page.getByLabel(saveLabel, { exact: true })).not.toBeChecked()
})
test('delayed DNS review opens the next day, keeps feedback hidden and confirms only the particular error', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-11T12:00:00Z'))
  await assign(page)
  await completePractice(page)
  await expect(
    training(page).getByRole('button', { name: 'Начать отложенную проверку' }),
  ).toHaveCount(0)
  await page.clock.setFixedTime(new Date('2026-10-12T12:00:00Z'))
  await page.reload()
  await expect(
    continuation(page).getByRole('link', { name: 'Открыть сегодняшнюю задачу' }),
  ).toHaveAttribute('href', /error=dns-cache/)
  await training(page)
    .getByRole('button', { name: 'Начать отложенную проверку', exact: true })
    .click()
  await expect(training(page)).toContainText('почтовый клиент')
  await expect(training(page)).not.toContainText('Согласованные наблюдения не подтверждают')
  await training(page)
    .getByRole('button', {
      name: 'Исследовать кэш/конфигурацию приложения: системное расхождение сейчас не показано',
      exact: true,
    })
    .click()
  await expect(training(page)).toContainText('Разбор откроется после обеих задач')
  await expect(training(page)).not.toContainText('Согласованные наблюдения не подтверждают')
  await page.reload()
  await expect(training(page)).toContainText('2 из 2')
  await training(page)
    .getByRole('button', {
      name: 'Сопоставить адрес подключения и журнал клиента со свежим системным разрешением; повторить исходную операцию после минимального действия',
      exact: true,
    })
    .click()
  await expect(training(page)).toContainText('Исправление ошибки подтверждено')
  await expect(training(page)).toContainText('Согласованные наблюдения не подтверждают')
  const done = await progress(page)
  expect(done.remediationAttempts).toHaveLength(2)
  expect(done.attempts).toHaveLength(0)
  expect(done.events).toHaveLength(3)
  expect(done.events[2]?.taskId).toBe('FIX-v1-dns-cache-review')
  await page.setViewportSize({ width: 320, height: 900 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(320)
  expect(
    (
      await new AxeBuilder({ page }).include('[aria-labelledby="error-practice-title"]').analyze()
    ).violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')),
  ).toEqual([])
})
test('memory-only remediation does not secretly survive reload', async ({ page }) => {
  await assign(page, false)
  await training(page)
    .getByRole('button', {
      name: 'Два пути разрешения дали разные адреса; источник расхождения ещё нужно установить',
      exact: true,
    })
    .click()
  await training(page).getByRole('button', { name: 'К выбору доказательства', exact: true }).click()
  await training(page)
    .getByRole('button', {
      name: 'Сопоставить запись ipconfig /displaydns, DNS интерфейса и прямой ответ для того же имени и типа',
      exact: true,
    })
    .click()
  await expect(training(page)).toContainText('Результат в памяти вкладки')
  await page.reload()
  await expect(training(page)).toContainText('Пока нет результатов')
  await expect(training(page).getByRole('button', { name: 'Начать короткое занятие' })).toHaveCount(
    0,
  )
})
