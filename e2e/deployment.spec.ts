import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('built SPA and worker operate under nested static path without rewrites', async ({ page }) => {
  const failed: string[] = []
  page.on('response', (response) => {
    if (response.status() >= 400) failed.push(response.url())
  })
  await page.goto('http://127.0.0.1:4174/preview/site/#/analyzer')
  await page.getByRole('button', { name: 'Загрузить демопример' }).click()
  await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
  await expect(page.getByTestId('adapter-card')).toHaveCount(2)
  await page.reload()
  await expect(page.getByLabel('Вывод команды')).toHaveValue('')
  expect(failed).toEqual([])
})
test('skip link retains route and focuses main content', async ({ page, browserName }) => {
  await page.goto('/#/analyzer')
  // macOS WebKit respects the platform's default link-traversal preference.
  await page.keyboard.press(
    browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab',
  )
  await expect(page.getByRole('link', { name: 'Перейти к содержимому' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()
  await expect(page).toHaveURL(/#\/analyzer$/)
})
test('large ping output remains navigable without rendering all responses', async ({ page }) => {
  const replies = 30_000
  const text = [
    'Pinging example.com [192.0.2.20] with 32 bytes of data:',
    ...Array<string>(replies).fill('Reply from 192.0.2.20: bytes=32 time<1ms TTL=56'),
    `Packets: Sent = ${replies}, Received = ${replies}, Lost = 0 (0% loss)`,
    'Minimum = 0ms, Maximum = 0ms, Average = 0ms',
  ].join('\n')
  await page.goto('/#/analyzer')
  await page.getByRole('tab', { name: 'Выбрать файл' }).click()
  await page.getByLabel('Выбрать локальный файл').setInputFiles({
    name: 'long-ping.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(text),
  })
  await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
  await expect(page.getByTestId('output-card')).toBeVisible()
  await expect(page.locator('.output-list > button')).toHaveCount(80)
  const pager = page.getByRole('navigation', { name: 'Страницы результатов команды' })
  await expect(pager).toContainText('1–80 из 30000')
  await pager.getByRole('button', { name: 'Далее' }).click()
  await expect(pager).toContainText('81–160 из 30000')
  await expect(page.locator('.output-list > button').first()).toContainText('Строка 82')
  await page.getByRole('button', { name: 'Очистить всё', exact: true }).click()
  await expect(page.getByTestId('output-card')).toHaveCount(0)
})
test('populated analyzer and report dialog have no serious accessibility violations', async ({
  page,
}) => {
  await page.goto('/#/analyzer')
  await page.getByRole('button', { name: 'Загрузить демопример' }).click()
  await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
  await expect(page.getByTestId('adapter-card')).toHaveCount(2)
  for (const report of [false, true]) {
    if (report) await page.getByRole('button', { name: 'Отчёт', exact: true }).click()
    const results = await new AxeBuilder({ page }).analyze()
    expect(
      results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious'),
    ).toEqual([])
  }
})
