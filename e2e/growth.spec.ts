import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
const config = (await readFile('src/fixtures/ipconfig-en-normal.txt', 'utf8'))
  .replaceAll('192.0.2.', '10.42.0.')
  .replace('DEMO-PC', 'PRIVATE-SESSION-PC')
async function addRecord(
  page: import('@playwright/test').Page,
  text: string,
  label: string,
  time: string,
) {
  // Router navigation preserves the in-memory session. Navigating to the same
  // full URL may reload the document (WebKit), intentionally clearing it.
  await page.getByRole('link', { name: 'Анализатор', exact: true }).click()
  await page.getByLabel('Вывод команды').fill(text)
  await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
  await expect(page.locator('.session-add')).toBeVisible()
  await page.getByText('Добавить эту проверку в рабочую сессию', { exact: true }).click()
  await page.getByLabel('Метка проверки', { exact: true }).fill(label)
  await page.getByLabel('Время проверки', { exact: true }).fill(time)
  await page.getByRole('button', { name: 'Добавить в сессию', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Проверка добавлена' })).toBeDisabled()
}
test('session explicitly groups outputs, correlates evidence and compares before/after privately', async ({
  page,
}) => {
  await page.goto('/#/sessions')
  await page.getByLabel('Название сессии').fill('PRIVATE INCIDENT TITLE')
  await page.getByLabel('Контекст устройства').fill('Учебный ПК A')
  await page.getByRole('button', { name: 'Создать сессию', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('подтвердите')
  await page.getByLabel('Подтверждаю, что добавлю проверки', { exact: false }).check()
  await page.getByRole('button', { name: 'Создать сессию', exact: true }).click()
  await addRecord(page, config, 'До VPN', '2026-10-09T12:00')
  await addRecord(
    page,
    config.replaceAll('10.42.0.10', '10.42.0.11').replaceAll('10.42.0.53', '10.42.0.55'),
    'После VPN',
    '2026-10-09T13:00',
  )
  await addRecord(
    page,
    (await readFile('src/fixtures/nslookup-en.txt', 'utf8')).replaceAll('192.0.2.', '10.42.0.'),
    'DNS',
    '2026-10-09T13:10',
  )
  await addRecord(
    page,
    (await readFile('src/fixtures/ping-en.txt', 'utf8')).replaceAll('192.0.2.', '10.42.0.'),
    'ICMP',
    '2026-10-09T13:11',
  )
  await page.goto('/#/sessions')
  await expect(page.locator('.session-records article')).toHaveCount(4)
  await expect(
    page.getByRole('heading', { name: 'DNS-запрос использует другой адрес сервера' }),
  ).toBeVisible()
  await page.getByLabel('До', { exact: true }).selectOption({ label: 'До VPN · ipconfig' })
  await page.getByLabel('После', { exact: true }).selectOption({ label: 'После VPN · ipconfig' })
  await expect(page.locator('.diff-list')).toContainText('IPv4 / префикс')
  await expect(page.locator('.diff-list')).toContainText('DNS')
  await expect(page.locator('.diff-list')).not.toContainText('10.42.0.')
  await page.getByRole('button', { name: 'Отчёт сессии', exact: true }).click()
  const report = page.getByRole('region', { name: 'Отчёт рабочей сессии' })
  await expect(report).not.toContainText('10.42.0.')
  await expect(report).not.toContainText('PRIVATE-SESSION-PC')
  await expect(report).not.toContainText('PRIVATE INCIDENT TITLE')
  await expect(report).toContainText('До: проверка 1. После: проверка 2.')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Создать рабочую сессию' })).toBeVisible()
})
test('learning saves only after opt-in and supports retrying mistakes', async ({ page }) => {
  await page.goto('/#/learning')
  await page.getByRole('button', { name: 'Начать тест', exact: true }).click()
  await page.getByRole('button', { name: 'Ответ на ICMP Echo Request', exact: true }).click()
  await expect(page.getByText('Верно', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.locator('.learning-metrics strong').first()).toHaveText('0 / 30')
  await page.getByLabel('Сохранять учебный прогресс на этом устройстве').check()
  await page.getByRole('button', { name: 'Начать тест', exact: true }).click()
  await page.getByRole('button', { name: 'Работу сайта по HTTPS', exact: true }).click()
  await expect(page.getByText('Разберём ошибку', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Завершить тест', exact: true }).click()
  await page.getByLabel('Только последние ошибки').check()
  await page.getByRole('button', { name: 'Начать тест', exact: true }).click()
  await page.getByRole('button', { name: 'Ответ на ICMP Echo Request', exact: true }).click()
  await expect(page.locator('.learning-metrics strong').first()).toHaveText('1 / 30')
  await expect(page.getByTestId('learning-save-status')).toHaveText(
    'Прогресс сохранён на устройстве.',
  )
  await page.reload()
  await expect(page.getByLabel('Сохранять учебный прогресс на этом устройстве')).toBeChecked()
  await expect(page.locator('.learning-metrics strong').first()).toHaveText('1 / 30')
  await page.getByLabel('Импорт учебного прогресса').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":99}'),
  })
  await expect(page.getByRole('alert')).toContainText('формат')
})
test('checklist marks export and reset correctly', async ({ page }) => {
  await page.goto('/#/playbooks')
  await page.locator('.playbook-steps input').first().check()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать чек-лист' }).click()
  const file = await (await download).path()
  expect(await readFile(file!, 'utf8')).toContain('- [x]')
  await page.getByRole('button', { name: 'Сбросить отметки' }).click()
  await expect(page.locator('.playbook-steps input').first()).not.toBeChecked()
})
test('command palette navigates to a filtered knowledge entry with keyboard', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Control+k')
  await page.getByLabel('Поиск разделов и знаний').fill('DNS-ответ')
  await page.getByLabel('Поиск разделов и знаний').press('Enter')
  await expect(page.getByLabel('Поиск по справочнику')).toHaveValue('Проверка DNS-ответа')
  await expect(page.locator('.knowledge-card')).toHaveCount(1)
})
test('route tool chooses longest prefix and supports source navigation', async ({ page }) => {
  await page.goto('/#/analyzer')
  await page
    .getByLabel('Вывод команды')
    .fill(
      'IPv4 Route Table\n0.0.0.0 0.0.0.0 192.0.2.1 192.0.2.10 1\n192.0.2.20 255.255.255.255 192.0.2.2 192.0.2.10 999',
    )
  await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
  await expect(page.getByTestId('output-card')).toBeVisible()
  await page.goto('/#/toolkit')
  await expect(page.locator('.session-observation')).toContainText('192.0.2.20/32')
  await page.getByRole('link', { name: 'Смотреть строку 3' }).click()
  await expect(page.locator('.source-line.highlighted')).toContainText('192.0.2.20')
  await page.goto('/#/toolkit')
  await page.getByLabel('Поиск порта или сервиса').fill('445')
  await expect(page.locator('.port-grid article')).toHaveCount(1)
  await expect(page.locator('.port-grid')).toContainText('SMB')
})
test('imported cases sort by actual date and can be renamed and filtered', async ({ page }) => {
  await page.goto('/#/cases')
  await page.getByLabel('Импортировать файл кейсов').setInputFiles({
    name: 'dates.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        cases: [
          {
            id: 'ea588d39-884b-4a4d-b6b1-671ade1e908c',
            title: 'Early',
            command: 'ping',
            createdAt: '2026-10-09T12:00:00Z',
            report: 'demo',
          },
          {
            id: 'ea588d39-884b-4a4d-b6b1-671ade1e908d',
            title: 'Late',
            command: 'ipconfig',
            createdAt: '2026-10-09T12:00:00.100Z',
            report: 'demo',
          },
        ],
      }),
    ),
  })
  await page.getByRole('button', { name: 'Сохранить на этом устройстве' }).click()
  await expect(page.locator('.case-card h2').first()).toHaveText('Late')
  await page.getByRole('button', { name: 'Переименовать кейс: Late' }).click()
  await page.getByLabel('Новое название кейса').fill('После VPN')
  await page.getByRole('button', { name: 'Сохранить название' }).click()
  await page.getByLabel('Поиск кейсов').fill('VPN')
  await expect(page.locator('.case-card')).toHaveCount(1)
  await expect(page.locator('.case-card h2')).toHaveText('После VPN')
})
for (const root of ['http://127.0.0.1:4173/', 'http://127.0.0.1:4174/preview/site/']) {
  test(`offline cache is opt-in, assets-only and supports analysis offline at ${new URL(root).pathname}`, async ({
    page,
    context,
  }) => {
    await page.goto(`${root}#/settings`)
    expect(
      await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
    ).toBe(0)
    await page.getByRole('button', { name: 'Включить офлайн-доступ' }).click()
    await expect(page.getByText('ОФЛАЙН-ДОСТУП ВКЛЮЧЁН', { exact: true })).toBeVisible()
    await page.goto(`${root}#/analyzer`)
    const secret = 'PRIVATE-OFFLINE-MARKER-12345'
    await page.getByLabel('Вывод команды').fill(config.replace('PRIVATE-SESSION-PC', secret))
    await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
    await expect(page.getByTestId('adapter-card')).toHaveCount(2)
    const cached = await page.evaluate(async () => {
      const result: Array<{ url: string; text: string }> = []
      for (const name of await caches.keys()) {
        const cache = await caches.open(name)
        for (const request of await cache.keys())
          result.push({ url: request.url, text: await (await cache.match(request))!.text() })
      }
      return result
    })
    expect(cached.length).toBeGreaterThan(10)
    expect(cached.every((item) => /\.(?:html|js|css|svg|webmanifest)$/.test(item.url))).toBe(true)
    expect(cached.some((item) => item.text.includes(secret))).toBe(false)
    await context.setOffline(true)
    await page.reload()
    await expect(page.getByLabel('Вывод команды')).toHaveValue('')
    await page.getByLabel('Вывод команды').fill(config)
    await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
    await expect(page.getByTestId('adapter-card')).toHaveCount(2)
    await page.goto(`${root}#/learning`)
    await expect(page.getByRole('button', { name: 'Начать тест' })).toBeEnabled()
    await page.getByRole('link', { name: 'Продвинутый курс', exact: true }).click()
    await page
      .getByRole('button', { name: 'Изучить: HTTPS и доверие сертификатам', exact: true })
      .click()
    const lab = page.getByRole('region', { name: 'Лабораторная: HTTPS и доверие сертификатам' })
    await lab.getByRole('button', { name: 'Показать подсказку', exact: true }).click()
    await expect(lab.getByRole('status')).toBeVisible()
    await lab.locator('.quiz-options button').first().click()
    await expect(lab.locator('.quiz-explanation')).toBeVisible()
    await page.goto(`${root}#/guide`)
    await page.getByRole('button', { name: /^Не открывается сайт/ }).click()
    await page.getByLabel('Только у одного пользователя или устройства').check()
    await page.getByLabel('Один сайт или приложение').check()
    await page.getByRole('button', { name: 'Показать план проверки' }).click()
    await expect(
      page.getByRole('heading', { name: 'План: Не открывается сайт', exact: true }),
    ).toBeVisible()
    await page.goto(`${root}#/toolkit?practice=subnet`)
    await page.getByLabel('Ответ на задание').fill('192.0.2.128')
    await page.getByRole('button', { name: 'Проверить ответ', exact: true }).click()
    await expect(page.locator('.practice-feedback')).toContainText('Верно')
    await page.goto(`${root}#/learning?view=practice`)
    await page.getByLabel('Самостоятельный ответ').fill('192.0.2.128')
    await page.getByRole('button', { name: 'Проверить самостоятельный ответ' }).click()
    await expect(page.getByRole('region', { name: 'Самостоятельное задание' })).toContainText(
      'Задание решено',
    )
    await page.goto(`${root}#/simulator?view=editor`)
    await page.getByLabel('Название сценария', { exact: true }).fill('Офлайн-инцидент')
    await page.getByLabel('Подтверждаю, что использованы только учебные данные').check()
    await page.getByRole('button', { name: 'Сохранить сценарий', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Мои сценарии — 1 / 20' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Мои сценарии — 1 / 20' })).toBeVisible()
    await context.setOffline(false)
    await page.goto(`${root}#/settings`)
    await page.getByRole('button', { name: 'Отключить офлайн-доступ' }).click()
    await expect(page.getByRole('button', { name: 'Включить офлайн-доступ' })).toBeVisible()
    expect(
      await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
    ).toBe(0)
  })
}
test('new pages fit mobile screens and meet serious accessibility checks in both themes', async ({
  page,
}) => {
  test.setTimeout(60_000)
  for (const route of ['sessions', 'learning', 'playbooks', 'settings']) {
    await page.setViewportSize({ width: 360, height: 800 })
    await page.goto(`/#/${route}`)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.setViewportSize({ width: 1280, height: 900 })
    for (const theme of ['dark', 'light']) {
      const current = (await page.locator('html').getAttribute('data-theme')) ?? 'dark'
      if (current !== theme)
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
