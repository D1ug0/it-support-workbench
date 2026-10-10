import { chooseOption } from './helpers/select'
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
const sample = await readFile('src/fixtures/ipconfig-en-normal.txt', 'utf-8')

for (const [name, heading] of [
  ['Ping: потери ICMP', 'Ответы ICMP'],
  ['Nslookup: DNS-ответ', 'Ответ DNS'],
  ['Tracert: пропуск хопа', 'Переходы маршрута'],
  ['Route print: IPv4 / IPv6', 'Таблица маршрутов'],
] as const) {
  test(`analyzes ${name}`, async ({ page }) => {
    await page.goto('/#/analyzer')
    await chooseOption(page, page.getByLabel('Демопример', { exact: true }), { label: name })
    const text = await page.getByLabel('Вывод команды').inputValue()
    await page
      .getByLabel('Вывод команды')
      .fill(text.replaceAll('example.com', 'private-query.example'))
    await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
    await expect(page.getByTestId('output-card')).toBeVisible()
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Наблюдения' }).click()
    await expect(page.locator('.finding-card')).not.toHaveCount(0)
    await page.getByRole('button', { name: 'Отчёт', exact: true }).click()
    await expect(page.getByTestId('report-preview')).not.toContainText('private-query.example')
  })
}
test('CIDR calculator supports /31 /32 and validation', async ({ page }) => {
  await page.goto('/#/toolkit')
  await page.getByLabel('IPv4-адрес', { exact: true }).fill('192.0.2.11')
  await page.getByRole('button', { name: '/31', exact: true }).click()
  await expect(page.locator('.subnet-results')).toContainText('192.0.2.10/31')
  await expect(page.locator('.subnet-hosts strong')).toHaveText('2')
  await page.getByRole('button', { name: '/32', exact: true }).click()
  await expect(page.locator('.subnet-hosts strong')).toHaveText('1')
  await page.getByLabel('IPv4-адрес', { exact: true }).fill('999.0.0.1')
  await expect(page.getByRole('alert')).toContainText('корректные IPv4')
})
test('knowledge search, categories and limitations', async ({ page }) => {
  await page.goto('/#/knowledge')
  await page.getByLabel('Поиск по справочнику').fill('DNS-ответ')
  await expect(page.locator('.knowledge-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Алгоритм и ограничения' }).click()
  await expect(page.getByText('Не меняйте DNS на публичный', { exact: false })).toBeVisible()
  await page.getByLabel('Поиск по справочнику').fill('unknown123')
  await expect(page.getByRole('heading', { name: 'Ничего не найдено' })).toBeVisible()
  await page.getByRole('button', { name: 'Сбросить поиск' }).click()
  await expect(page.locator('.knowledge-card')).toHaveCount(22)
})
test('simulator explains a mistaken action and completes a scenario', async ({ page }) => {
  await page.goto('/#/simulator')
  await page.getByRole('button', { name: 'Сайт не открывается по имени', exact: false }).click()
  await page.getByRole('button', { name: 'Сразу заменить DNS на публичный' }).click()
  await expect(page.getByText('ДЕЙСТВИЕ НЕ СОГЛАСОВАНО')).toBeVisible()
  await page
    .getByRole('button', { name: 'Уточнить точную ошибку и масштаб проблемы', exact: true })
    .click()
  await page.getByRole('button', { name: 'Выполнить nslookup нужного имени', exact: true }).click()
  await page
    .getByRole('button', {
      name: 'Сравнить ответ согласованного DNS у работающего клиента',
      exact: true,
    })
    .click()
  await expect(page.getByText('СЦЕНАРИЙ ЗАВЕРШЁН')).toBeVisible()
  await expect(page.locator('.simulation-complete h2')).toContainText('85')
  await page.getByRole('button', { name: 'Следующий сценарий' }).click()
  await expect(page.locator('.scenario-card')).toHaveCount(6)
})
test('opt-in cases survive refresh, compare and delete with consent', async ({ page }) => {
  for (const title of ['До VPN', 'После VPN']) {
    await page.goto('/#/analyzer')
    await page.getByLabel('Вывод команды').fill(sample)
    await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
    await expect(page.getByTestId('adapter-card')).toHaveCount(2)
    await page.getByRole('button', { name: 'Отчёт', exact: true }).click()
    await page.getByLabel('Название проверки (необязательно)').fill(title)
    await page.getByRole('button', { name: 'Сохранить локальный кейс' }).click()
    await expect(page.getByRole('button', { name: 'Кейс сохранён на устройстве' })).toBeDisabled()
    await page.keyboard.press('Escape')
  }
  await page.goto('/#/cases')
  await expect(page.locator('.case-card')).toHaveCount(2)
  await page.reload()
  await expect(page.locator('.case-card')).toHaveCount(2)
  await page.getByLabel('Выбрать для сравнения: До VPN').check()
  await page.getByLabel('Выбрать для сравнения: После VPN').check()
  await page.getByRole('button', { name: 'Сравнить (2/2)' }).click()
  await expect(page.locator('.comparison-columns>div')).toHaveCount(2)
  page.on('dialog', (dialog) => {
    void dialog.accept()
  })
  await page.getByRole('button', { name: 'Удалить всё', exact: true }).click()
  await expect(page.locator('.case-card')).toHaveCount(0)
})
test('case import requires preview before saving and validates schema', async ({ page }) => {
  await page.goto('/#/cases')
  await page.getByLabel('Импортировать файл кейсов').setInputFiles({
    name: 'cases.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        cases: [
          {
            id: 'ea588d39-884b-4a4d-b6b1-671ade1e908c',
            title: 'Учебный импорт',
            command: 'ping',
            createdAt: '2026-10-09T12:00:00Z',
            report: '# Synthetic report',
          },
        ],
      }),
    ),
  })
  await expect(page.locator('.import-preview')).toBeVisible()
  await expect(page.locator('.case-card')).toHaveCount(0)
  await page.getByLabel('Импортировать файл кейсов').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":99}'),
  })
  await expect(page.getByRole('alert')).toContainText('schemaVersion')
  await expect(page.locator('.import-preview')).toHaveCount(0)
  await page.getByLabel('Импортировать файл кейсов').setInputFiles({
    name: 'cases.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        cases: [
          {
            id: 'ea588d39-884b-4a4d-b6b1-671ade1e908c',
            title: 'Учебный импорт',
            command: 'ping',
            createdAt: '2026-10-09T12:00:00Z',
            report: '# Synthetic report',
          },
        ],
      }),
    ),
  })
  await expect(page.locator('.import-preview')).toBeVisible()
  await page.getByRole('button', { name: 'Сохранить на этом устройстве' }).click()
  await expect(page.locator('.case-card')).toHaveCount(1)
  await page.getByLabel('Импортировать файл кейсов').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":99}'),
  })
  await expect(page.getByRole('alert')).toContainText('schemaVersion')
})
test('all added pages fit mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  for (const path of ['toolkit', 'knowledge', 'simulator', 'cases']) {
    await page.goto(`/#/${path}`)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
  }
})
test('all added pages meet serious accessibility checks in both themes', async ({ page }) => {
  for (const path of ['toolkit', 'knowledge', 'simulator', 'cases']) {
    await page.goto(`/#/${path}`)
    for (const theme of ['dark', 'light']) {
      const activeTheme = (await page.locator('html').getAttribute('data-theme')) ?? 'dark'
      if (activeTheme !== theme)
        await page
          .getByRole('button', {
            name: theme === 'light' ? 'Включить светлую тему' : 'Включить тёмную тему',
          })
          .click()
      const results = await new AxeBuilder({ page }).analyze()
      expect(
        results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious'),
      ).toEqual([])
    }
  }
})
