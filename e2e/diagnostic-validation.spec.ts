import { expect, test } from '@playwright/test'

for (const { name, text, message } of [
  {
    name: 'oversized UTF-8 input',
    text: 'я'.repeat(1024 * 1024 + 1),
    message: 'Текст превышает лимит 2 MiB.',
  },
  {
    name: 'too many physical lines',
    text: 'x\n'.repeat(50_000),
    message: 'В тексте более 50 000 строк.',
  },
]) {
  test(`the worker rejects ${name}`, async ({ page }) => {
    await page.goto('/#/analyzer')
    // Dispatch the real input event without selecting a multi-megabyte textarea value.
    await page.getByLabel('Вывод команды').evaluate((element: HTMLTextAreaElement, value) => {
      element.value = value
      element.dispatchEvent(new Event('input', { bubbles: true }))
    }, text)
    await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
    await expect(page.getByText(message, { exact: false })).toBeVisible()
  })
}

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

test('unsafe ICMP times do not become successful replies', async ({ page }) => {
  await page.goto('/#/analyzer')
  await page
    .getByLabel('Вывод команды')
    .fill(
      'Pinging 192.0.2.20 with 32 bytes of data:\n' +
        'Reply from 192.0.2.20: time=9007199254740993ms TTL=56\n' +
        'Reply from 192.0.2.20: time<1ms TTL=56\n' +
        'Packets: Sent = 2, Received = 2, Lost = 0',
    )
  await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
  const replies = page.getByTestId('output-card').locator('.output-list button')
  await expect(replies).toHaveCount(1)
  await expect(replies.first()).toContainText('<1 ms')
  await expect(replies.first()).toContainText('Строка 3')
  await expect(page.getByText('Время ICMP-ответа превышает допустимый диапазон.')).toBeVisible()
})
