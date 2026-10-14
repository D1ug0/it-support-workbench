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

test('malformed routes are excluded while valid routes keep their source lines', async ({
  page,
}) => {
  await page.goto('/#/analyzer')
  await page
    .getByLabel('Вывод команды')
    .fill(
      'IPv4 Route Table\n' +
        '0.0.0.0 0.0.0.0 192.0.2.1 192.0.2.10 0x10\n' +
        '192.0.2.0 255.255.255.0 On-link 192.0.2.10 25',
    )
  await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
  const output = page.getByTestId('output-card')
  await expect(output).toBeVisible()
  await expect(output).toContainText('192.0.2.0')
  await expect(output).not.toContainText('0.0.0.0')
  await expect(page.getByText('Некорректный IPv4-маршрут исключён.')).toBeVisible()
})
