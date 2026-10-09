import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('file import is local and refresh discards all diagnostics', async ({ page }) => {
  await page.goto('/#/analyzer')
  const external: string[] = []
  page.on('request', (request) => {
    if (request.method() !== 'GET' || new URL(request.url()).host !== '127.0.0.1:4173')
      external.push(request.url())
  })
  await page.getByRole('tab', { name: 'Выбрать файл' }).click()
  await page
    .getByLabel('Выбрать локальный файл')
    .setInputFiles('src/fixtures/ipconfig-ru-normal.txt')
  await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
  await expect(page.getByTestId('adapter-card')).toHaveCount(2)
  expect(external).toEqual([])
  expect(
    await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
  ).toEqual({ local: 0, session: 0 })
  await page.reload()
  await expect(page.getByLabel('Вывод команды')).toHaveValue('')
  await expect(page.getByTestId('adapter-card')).toHaveCount(0)
})
test('HTML and scripts are displayed as text', async ({ page }) => {
  const text = await readFile('src/fixtures/ipconfig-malicious-text.txt', 'utf-8')
  const dialogs: string[] = []
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message())
    void dialog.dismiss()
  })
  await page.goto('/#/analyzer')
  await page.getByLabel('Вывод команды').fill(text)
  await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
  await expect(page.getByTestId('adapter-card')).toHaveCount(1)
  await expect(page.getByTestId('adapter-card')).toContainText('<img src=x')
  expect(await page.locator('main img').count()).toBe(0)
  expect(dialogs).toEqual([])
})
test('default export removes private IP and identifiers', async ({ page }) => {
  const text = (await readFile('src/fixtures/ipconfig-en-normal.txt', 'utf-8'))
    .replaceAll('192.0.2.', '10.42.0.')
    .replaceAll('DEMO-PC', 'PRIVATE-HOST')
    .replaceAll('2001:db8::10', 'fd00::10')
  await page.goto('/#/analyzer')
  await page.getByLabel('Вывод команды').fill(text)
  await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
  await expect(page.getByTestId('adapter-card')).toHaveCount(2)
  await expect(page.getByTestId('adapter-card').first()).not.toContainText('10.42.0.')
  await page.getByRole('button', { name: 'Отчёт', exact: true }).click()
  await expect(page.getByTestId('report-preview')).not.toContainText('10.42.0.')
  await expect(page.getByTestId('report-preview')).not.toContainText('PRIVATE-HOST')
  await expect(page.getByTestId('report-preview')).not.toContainText('fd00::10')
})
test('binary file and oversized file are rejected', async ({ page }) => {
  await page.goto('/#/analyzer')
  await page.getByRole('tab', { name: 'Выбрать файл' }).click()
  await page.getByLabel('Выбрать локальный файл').setInputFiles({
    name: 'binary.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from([1, 0, 2, 3]),
  })
  await expect(page.getByRole('alert')).toContainText('бинарные')
  await page.getByLabel('Выбрать локальный файл').setInputFiles({
    name: 'large.txt',
    mimeType: 'text/plain',
    buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 65),
  })
  await expect(page.getByRole('alert')).toContainText('2 MiB')
})
