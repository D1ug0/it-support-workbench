import { expect, test } from '@playwright/test'

test('the worker rejects oversized UTF-8 input and too many physical lines', async ({ page }) => {
  await page.goto('/#/analyzer')
  const input = page.getByLabel('Вывод команды')
  const analyze = page.getByRole('button', { name: 'Проанализировать', exact: true })
  await input.fill('я'.repeat(1024 * 1024 + 1))
  await analyze.click()
  await expect(page.getByText('Текст превышает лимит 2 MiB.', { exact: false })).toBeVisible()
  await input.fill('x\n'.repeat(50_000))
  await analyze.click()
  await expect(page.getByText('В тексте более 50 000 строк.', { exact: false })).toBeVisible()
})
