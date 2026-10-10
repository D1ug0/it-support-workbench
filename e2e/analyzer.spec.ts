import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
const fixture = await readFile(
  new URL('../src/fixtures/ipconfig-en-normal.txt', import.meta.url),
  'utf-8',
)

test('demo → analyze → evidence → redacted download → clear', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Попробовать пример', exact: true }).click()
  await expect(page).toHaveURL(/#\/analyzer$/)
  await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
  await expect(page.getByTestId('adapter-card')).toHaveCount(2)
  await page.getByRole('button', { name: 'Показать исходные строки DNS' }).first().click()
  await expect(page.locator('.source-line.highlighted')).toHaveCount(2)
  await page.getByRole('button', { name: 'Наблюдения' }).click()
  await expect(page.getByRole('heading', { name: 'Несколько DNS-серверов' })).toBeVisible()
  await page.getByRole('button', { name: 'Ограничения и следующие проверки' }).first().click()
  await expect(page.getByText('Что проверить дальше')).toBeVisible()
  await page.getByRole('button', { name: 'Отчёт', exact: true }).click()
  const preview = page.getByTestId('report-preview')
  await expect(preview).not.toContainText('DEMO-PC')
  await expect(preview).not.toContainText('02-00-00-00-00-01')
  await expect(preview).not.toContainText('Windows IP Configuration')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать отчёт' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('workbench-report.md')
  const path = await download.path()
  expect(await readFile(path!, 'utf-8')).toContain('NET-006')
  await page.getByRole('button', { name: 'Закрыть предпросмотр' }).click()
  await page.getByRole('button', { name: 'Очистить всё' }).click()
  await expect(page.getByLabel('Вывод команды')).toHaveValue('')
  await expect(page.getByTestId('adapter-card')).toHaveCount(0)
})
test('invalid and unsupported inputs explain the problem', async ({ page }) => {
  await page.goto('/#/analyzer')
  await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
  await expect(page.getByText('Вставьте вывод команды или загрузите пример.')).toBeVisible()
  await page.getByLabel('Вывод команды').fill('unknown command')
  await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
  await expect(page.getByText('Формат не распознан', { exact: false })).toBeVisible()
})
test('raw report requires separate consent and dialog supports Escape', async ({ page }) => {
  await page.goto('/#/analyzer')
  await page.getByLabel('Вывод команды').fill(fixture)
  await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
  await expect(page.getByTestId('adapter-card')).toHaveCount(2)
  await page.getByRole('button', { name: 'Отчёт', exact: true }).click()
  await page.getByLabel('Включить исходные данные', { exact: true }).check()
  await expect(page.getByRole('button', { name: 'Скачать отчёт' })).toBeDisabled()
  await expect(page.getByTestId('report-preview')).not.toContainText('Windows IP Configuration')
  await page.getByLabel('Подтверждаю включение необезличенного исходника').check()
  await expect(page.getByTestId('report-preview')).toContainText('Windows IP Configuration')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
})
for (const width of [360, 375, 414]) {
  test(`responsive layout and theme at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 })
    for (const route of ['/', '/#/analyzer', '/#/about']) {
      await page.goto(route)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      for (const font of ['', 'Verdana, sans-serif']) {
        // Broader fallback glyphs reproduce the Linux CI overflow on macOS too.
        await page.evaluate((family) => {
          document.documentElement.style.fontFamily = family
        }, font)
        await expect
          .poll(
            () =>
              page.evaluate(
                () =>
                  Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
                  window.innerWidth,
              ),
            {
              message: `${route} at ${width}px with ${font || 'system font'} must fit the viewport`,
            },
          )
          .toBeLessThanOrEqual(0)
      }
    }
    await page.getByRole('button', { name: 'Включить светлую тему' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.getByRole('button', { name: 'Включить тёмную тему' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })
}
test('main routes have no serious accessibility violations', async ({ page }) => {
  for (const route of ['/', '/#/analyzer', '/#/about']) {
    await page.goto(route)
    const results = await new AxeBuilder({ page }).analyze()
    expect(
      results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious'),
    ).toEqual([])
  }
})
