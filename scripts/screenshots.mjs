import { chromium } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
})
await mkdir('docs/screenshots', { recursive: true })
const origin = globalThis.process.env.PREVIEW_URL ?? 'http://127.0.0.1:5173'
async function capture(name) {
  await page.evaluate(() => {
    globalThis.document.activeElement?.blur?.()
    globalThis.scrollTo(0, 0)
  })
  await page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: true })
}
try {
  await page.goto(origin)
  await page
    .getByRole('heading', { name: 'Диагностика начинается с фактов.', exact: false })
    .waitFor()
  await capture('overview')
  await page.getByRole('button', { name: 'Попробовать пример', exact: true }).click()
  await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
  await page.getByTestId('adapter-card').first().waitFor()
  await capture('analyzer')
  await page.getByRole('button', { name: 'Включить светлую тему' }).click()
  await capture('analyzer-light')
  await page.goto(`${origin}/#/simulator`)
  await page.getByRole('button', { name: 'Сайт не открывается по имени', exact: false }).click()
  await page
    .getByRole('button', { name: 'Уточнить точную ошибку и масштаб проблемы', exact: true })
    .click()
  await capture('simulator')
  await page.goto(`${origin}/#/learning`)
  await page.getByRole('button', { name: 'Начать тест', exact: true }).click()
  await page.getByRole('button', { name: 'Ответ на ICMP Echo Request', exact: true }).click()
  await capture('learning')
  await page.goto(`${origin}/#/guide`)
  await page.getByRole('button', { name: /^Не открывается сайт/ }).click()
  await page.getByLabel('Только у одного пользователя или устройства').check()
  await page.getByLabel('Один сайт или приложение').check()
  await page.getByRole('button', { name: 'Показать план проверки' }).click()
  await page.getByRole('heading', { name: 'План: Не открывается сайт', exact: true }).waitFor()
  await capture('guide')
  await page.goto(`${origin}/#/toolkit?practice=subnet`)
  await page.getByLabel('Ответ на задание').fill('192.0.2.128')
  await page.getByRole('button', { name: 'Проверить ответ', exact: true }).click()
  await capture('subnet-practice')
  await page.goto(`${origin}/#/sessions`)
  await page.getByLabel('Название сессии').fill('Демонстрация диагностики')
  await page.getByLabel('Контекст устройства').fill('Вымышленный учебный ПК')
  await page.getByLabel('Подтверждаю, что добавлю проверки', { exact: false }).check()
  await page.getByRole('button', { name: 'Создать сессию', exact: true }).click()
  const syntheticConfig = await readFile('src/fixtures/ipconfig-en-normal.txt', 'utf8')
  for (const label of ['До проверки', 'После проверки']) {
    await page.getByRole('link', { name: 'Анализатор', exact: true }).click()
    await page
      .getByLabel('Вывод команды')
      .fill(
        label === 'После проверки'
          ? syntheticConfig.replaceAll('192.0.2.10', '192.0.2.11')
          : syntheticConfig,
      )
    await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
    await page.getByText('Добавить эту проверку в рабочую сессию', { exact: true }).click()
    await page.getByLabel('Метка проверки', { exact: true }).fill(label)
    await page.getByRole('button', { name: 'Добавить в сессию', exact: true }).click()
    await page.getByRole('button', { name: 'Проверка добавлена' }).waitFor()
  }
  await page.getByRole('link', { name: 'Рабочие сессии', exact: true }).click()
  await page.getByLabel('До', { exact: true }).selectOption({ label: 'До проверки · ipconfig' })
  await page
    .getByLabel('После', { exact: true })
    .selectOption({ label: 'После проверки · ipconfig' })
  await capture('session')
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(origin)
  await capture('mobile')
} finally {
  await browser.close()
}
