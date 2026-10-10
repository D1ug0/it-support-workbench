import { chooseOption } from './helpers/select'
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
async function addRecord(page: Page, text: string, label: string) {
  await page.getByRole('link', { name: 'Анализатор', exact: true }).click()
  await page.getByLabel('Вывод команды').fill(text)
  await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
  await page.getByText('Добавить эту проверку в рабочую сессию', { exact: true }).click()
  await page.getByLabel('Метка проверки', { exact: true }).fill(label)
  await page.getByRole('button', { name: 'Добавить в сессию', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Проверка добавлена' })).toBeDisabled()
}
test('independent practice validates input, locks attempts and persists journal/weekly goal only on opt-in', async ({
  page,
}) => {
  await page.goto('/#/learning?view=practice')
  await page.getByLabel('Сохранять учебный прогресс на этом устройстве').check()
  const task = page.getByRole('region', { name: 'Самостоятельное задание' })
  await task.getByLabel('Самостоятельный ответ').fill('bad')
  await task.getByRole('button', { name: 'Проверить самостоятельный ответ' }).click()
  await expect(task).toContainText('Уточните формат')
  await task.getByLabel('Самостоятельный ответ').fill('192.0.2.128')
  await task.getByRole('button', { name: 'Проверить самостоятельный ответ' }).click()
  await expect(task).toContainText('Задание решено')
  await expect(task.getByRole('button', { name: 'Проверить самостоятельный ответ' })).toBeDisabled()
  await expect(page.getByTestId('learning-save-status')).toHaveText(
    'Прогресс сохранён на устройстве.',
  )
  await page.getByRole('link', { name: 'Журнал обучения', exact: true }).click()
  await expect(page.locator('.learning-event-list li')).toHaveCount(1)
  await page.getByLabel('Цель на неделю', { exact: true }).fill('12')
  await page.getByRole('button', { name: 'Сохранить учебную цель' }).click()
  await expect(page.getByTestId('learning-save-status')).toHaveText(
    'Прогресс сохранён на устройстве.',
  )
  await page.reload()
  await expect(page.getByLabel('Цель на неделю', { exact: true })).toHaveValue('12')
  await expect(page.locator('.learning-event-list li')).toHaveCount(1)
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Экспорт прогресса', exact: true }).click()
  const saved = JSON.parse(await readFile((await (await pending).path())!, 'utf8'))
  expect(saved.schemaVersion).toBe(3)
  expect(saved.journal).toHaveLength(1)
  expect(saved.journal[0]).not.toHaveProperty('answer')
  expect(saved.journal[0].kind).toBe('practice')
  await page.getByRole('link', { name: 'Самостоятельная практика', exact: true }).click()
  await chooseOption(page, page.getByLabel('Направление практики'), { label: 'Подсети' })
  await page.getByRole('button', { name: 'Быстрый поиск (Ctrl или Command K)' }).click()
  await page.getByLabel('Поиск разделов и знаний').fill('Практика: IPv4 ICMP payload')
  await page.keyboard.press('Enter')
  await expect(
    page
      .getByRole('region', { name: 'Самостоятельное задание' })
      .getByRole('heading', { name: 'IPv4 ICMP payload', exact: true }),
  ).toBeVisible()
})
test('new formats auto-detect, explain transport limits and exclude private DNS/TXT from exports', async ({
  page,
}) => {
  await page.goto('/#/analyzer')
  for (const [file, kind] of [
    ['dns-srv-ru.txt', 'dns-records'],
    ['powershell-ip.json', 'powershell'],
    ['powershell-tcp.json', 'powershell'],
  ] as const) {
    await page.getByLabel('Вывод команды').fill(await readFile(`src/fixtures/${file}`, 'utf8'))
    await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
    await expect(page.locator('.output-card')).toContainText(
      kind === 'dns-records' ? 'SRV' : file === 'powershell-ip.json' ? 'Интерфейс 12' : 'TCP 443',
    )
  }
  await page.getByRole('tab', { name: 'Выбрать файл', exact: true }).click()
  await page.getByLabel('Выбрать локальный файл').setInputFiles({
    name: 'tcp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(await readFile('src/fixtures/powershell-tcp.json', 'utf8')),
  })
  await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
  await expect(page.locator('.output-card')).toContainText('TCP 443')
  await page.getByRole('tab', { name: 'Вставить текст', exact: true }).click()
  await page.getByLabel('Вывод команды').fill(
    JSON.stringify([
      { Name: 'private.example', Type: 16, Strings: ['PRIVATE-TXT'] },
      { Name: 'private.example', Type: 15, NameExchange: 'mail.private.example', Preference: 10 },
    ]),
  )
  await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
  await expect(page.locator('.output-card')).toContainText('TXT')
  await expect(page.locator('.output-card')).not.toContainText('private.example')
  await page.getByRole('button', { name: 'Отчёт', exact: true }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать отчёт', exact: true }).click()
  const report = await readFile((await (await pending).path())!, 'utf8')
  expect(report).not.toContain('private.example')
  expect(report).not.toContain('PRIVATE-TXT')
  expect(report).toContain('MX preference 10')
})
test('scenario editor creates, validates, persists and plays custom two-stage incident', async ({
  page,
}) => {
  await page.goto('/#/simulator?view=editor')
  await page.getByLabel('Название сценария', { exact: true }).fill('Учебный incident DNS')
  await page.getByRole('button', { name: 'Добавить этап', exact: true }).click()
  await page.getByLabel('Подтверждаю, что использованы только учебные данные').check()
  await page.getByRole('button', { name: 'Сохранить сценарий', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Мои сценарии — 1 / 20' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Мои сценарии — 1 / 20' })).toBeVisible()
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click()
  await page.getByLabel('Подтверждаю, что использованы только учебные данные').check()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать сценарий JSON' }).click()
  const json = await readFile((await (await pending).path())!, 'utf8')
  await page.getByLabel('Импорт сценариев JSON').setInputFiles({
    name: 'scenario.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  })
  await expect(page.getByRole('heading', { name: 'Предпросмотр импорта' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Импортировать сценарии (1)' })).toBeDisabled()
  await page.getByLabel('Подтверждаю учебные данные импортируемых сценариев').check()
  await page.getByRole('button', { name: 'Импортировать сценарии (1)' }).click()
  await expect(page.getByText('Сценарии импортированы.', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Мои сценарии — 1 / 20' })).toBeVisible()
  await page.getByRole('link', { name: 'Пройти', exact: true }).click()
  for (let i = 0; i < 2; i++)
    await page.getByRole('button', { name: 'Собрать данные', exact: true }).click()
  await expect(page.locator('.simulation-complete')).toContainText('100 / 100')
  await page.getByRole('link', { name: 'Редактор инцидентов', exact: true }).click()
  await page.getByLabel('Импорт сценариев JSON').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ schemaVersion: 1, scenarios: [{ id: 'INC-DNS', source: 'PRIVATE' }] }),
    ),
  })
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Мои сценарии — 1 / 20' })).toBeVisible()
})
test('session archive explicitly saves, redacts, restores after reload and round trips through import', async ({
  page,
}) => {
  await page.goto('/#/sessions')
  await page.getByLabel('Название сессии').fill('PRIVATE SESSION')
  await page.getByLabel('Контекст устройства').fill('PRIVATE PC')
  await page.getByLabel('Подтверждаю, что добавлю проверки', { exact: false }).check()
  await page.getByRole('button', { name: 'Создать сессию', exact: true }).click()
  const config = (await readFile('src/fixtures/ipconfig-en-normal.txt', 'utf8'))
    .replaceAll('192.0.2.', '10.42.0.')
    .replace('DEMO-PC', 'PRIVATE-PC')
  await addRecord(page, config, 'До')
  await addRecord(page, config.replaceAll('10.42.0.10', '10.42.0.11'), 'После')
  await page.getByRole('link', { name: 'Рабочие сессии', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Сохранённые архивы — 0 / 20' })).toBeVisible()
  await page.getByRole('button', { name: 'Подготовить архив сессии' }).click()
  const preview = page.getByRole('region', { name: 'JSON обезличенного архива' })
  await expect(preview).not.toContainText('10.42.0.')
  await expect(preview).not.toContainText('PRIVATE')
  await expect(preview).toContainText('[IPv4')
  await expect(page.getByRole('button', { name: 'Сохранить архив', exact: true })).toBeDisabled()
  await page.getByLabel('Проверил обезличенный архив').check()
  await page.getByRole('button', { name: 'Сохранить архив', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Сохранённые архивы — 1 / 20' })).toBeVisible()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать архив JSON' }).click()
  const json = await readFile((await (await pending).path())!, 'utf8')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Создать рабочую сессию' })).toBeVisible()
  await page.getByRole('button', { name: 'Восстановить сессию' }).click()
  await expect(page.locator('.session-records article')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Открыть источник' }).first()).toBeDisabled()
  await chooseOption(page, page.getByLabel('До', { exact: true }), {
    label: 'Проверка 1 · ipconfig',
  })
  await chooseOption(page, page.getByLabel('После', { exact: true }), {
    label: 'Проверка 2 · ipconfig',
  })
  await expect(page.locator('.diff-list')).toContainText('IPv4 / префикс')
  await expect(page.locator('.diff-list')).not.toContainText('10.42.0.')
  await page.getByLabel('Импорт архива JSON').setInputFiles({
    name: 'archive.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  })
  await page.getByLabel('Проверил обезличенный архив').check()
  await page.getByRole('button', { name: 'Сохранить архив', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Сохранённые архивы — 1 / 20' })).toBeVisible()
})
test('new learning and storage pages fit 360px, wide fonts and both themes with accessible forms', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 360, height: 800 })
  for (const route of [
    'learning?view=practice',
    'learning?view=journal',
    'simulator?view=editor',
    'sessions',
    'analyzer',
  ]) {
    await page.goto(`/#/${route}`)
    if (route === 'analyzer') {
      await page.getByText('Как получить вывод команды в Windows?', { exact: true }).click()
      await page.getByText('PowerShell: экспортировать данные в JSON', { exact: true }).click()
    }
    await page.evaluate(() => (document.documentElement.style.fontFamily = 'Verdana, sans-serif'))
    await expect(page.locator('main')).toBeVisible()
    for (const theme of ['dark', 'light']) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      const scan = await new AxeBuilder({ page }).analyze()
      expect(
        scan.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')),
      ).toEqual([])
    }
  }
})
