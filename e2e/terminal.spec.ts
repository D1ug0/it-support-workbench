import { chooseOption } from './helpers/select'
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
async function start(page: Page, lab = 'TERM-DNS-SERVER') {
  await page.goto(`/#/terminal?lab=${lab}`)
  await page.getByLabel('Простой ввод и текстовый вывод').check()
}
async function run(page: Page, command: string) {
  await page.getByLabel('Команда учебного терминала', { exact: true }).fill(command)
  await page.getByRole('button', { name: 'Выполнить в учебной среде', exact: true }).click()
  await expect(page.locator('.terminal-records li').first().locator('code').first()).toHaveText(
    command,
  )
}
const tcp = 'Test-NetConnection portal.lab.example -Port 443'
test('DNS lab changes virtual settings, analyzes and compares outputs, records only one completion', async ({
  page,
}) => {
  await start(page)
  await run(page, 'ipconfig /all')
  await page.getByRole('button', { name: 'Разобрать проверку 1', exact: true }).click()
  await expect(page.getByTestId('adapter-card')).toContainText('192.0.2.54')
  await run(page, tcp)
  await run(page, 'nslookup portal.lab.example 192.0.2.53')
  await run(page, 'Set-DnsClientServerAddress -InterfaceIndex 12 -ServerAddresses 192.0.2.53')
  await run(page, 'ipconfig /all')
  await run(page, tcp)
  await chooseOption(page, page.getByLabel('Учебная проверка до', { exact: true }), '1')
  await chooseOption(page, page.getByLabel('Учебная проверка после', { exact: true }), '5')
  await expect(page.locator('.diff-list')).toContainText('DNS')
  await expect(page.locator('.diff-list')).toContainText('192.0.2.53')
  await page.getByLabel('На адаптере выбран DNS-сервер без записи портала', { exact: true }).check()
  await page.getByRole('button', { name: 'Проверить решение', exact: true }).click()
  await expect(page.locator('.terminal-feedback')).toContainText('100/100')
  await expect(page.getByRole('button', { name: 'Проверить решение', exact: true })).toBeDisabled()
  await page.getByRole('link', { name: 'Журнал обучения', exact: true }).click()
  await chooseOption(page, page.getByLabel('Тип учебного события'), 'terminal')
  await expect(page.locator('.learning-event-list')).toContainText('Неверный DNS-сервер')
})
test('cache lab keeps authoritative DNS and client cache distinct, compares TCP before and after', async ({
  page,
}) => {
  await start(page, 'TERM-DNS-CACHE')
  await run(page, 'ipconfig /displaydns')
  await run(page, 'nslookup portal.lab.example')
  await expect(page.locator('.terminal-records li').first()).toContainText('192.0.2.20')
  await run(page, tcp)
  await expect(page.locator('.terminal-records li').first()).toContainText('198.51.100.99')
  await run(page, 'ipconfig /flushdns')
  await run(page, tcp)
  await chooseOption(page, page.getByLabel('Учебная проверка до', { exact: true }), '3')
  await chooseOption(page, page.getByLabel('Учебная проверка после', { exact: true }), '5')
  await expect(page.locator('.diff-list')).toContainText('192.0.2.20')
  await page.getByLabel('В клиентском DNS-кэше остался старый адрес', { exact: true }).check()
  await page.getByRole('button', { name: 'Проверить решение', exact: true }).click()
  await expect(page.locator('.terminal-feedback')).toContainText('100/100')
})
test('exam finalizes once and opt-in progress survives reload', async ({ page }) => {
  await start(page, 'TERM-ICMP-TCP')
  await chooseOption(page, page.getByLabel('Режим лаборатории'), 'exam')
  await page.getByLabel('Сохранять учебный прогресс на этом устройстве').check()
  await expect(page.getByRole('button', { name: 'Следующая подсказка', exact: false })).toHaveCount(
    0,
  )
  await run(page, 'ping portal.lab.example')
  await run(page, tcp)
  await page.getByLabel('ICMP Echo не отвечает, но TCP 443 доступен', { exact: true }).check()
  await page.getByRole('button', { name: 'Завершить проверочную работу', exact: true }).click()
  await expect(page.locator('.terminal-feedback')).toContainText('100/100')
  await expect(page.getByText('Сохраняем учебный результат…')).toHaveCount(0)
  await page.goto('/#/learning?view=journal')
  await expect(page.locator('.learning-event-list')).toContainText('Ping молчит, TCP отвечает')
  await page.reload()
  await expect(page.locator('.learning-event-list')).toContainText('Ping молчит, TCP отвечает')
})
test('explicit checkpoint restore excludes typed commands and isolates real analyzer input', async ({
  page,
}) => {
  await page.goto('/#/analyzer')
  await page.getByLabel('Вывод команды', { exact: true }).fill('PRIVATE-LIVE-DIAGNOSTIC')
  await page.getByRole('link', { name: 'Учебный терминал', exact: true }).click()
  await page.getByLabel('Простой ввод и текстовый вывод').check()
  const outgoing: string[] = []
  page.on('request', (request) => {
    if (request.method() !== 'GET' || new URL(request.url()).host !== '127.0.0.1:4173')
      outgoing.push(request.url())
  })
  await run(page, 'help PRIVATE-COMMAND')
  await run(page, 'Set-DnsClientServerAddress -InterfaceIndex 12 -ServerAddresses 192.0.2.53')
  await run(page, 'ipconfig /all')
  await page.getByRole('button', { name: 'Разобрать проверку 3', exact: true }).click()
  await page.getByRole('link', { name: 'Анализатор', exact: true }).click()
  await expect(page.getByLabel('Вывод команды', { exact: true })).toHaveValue(
    'PRIVATE-LIVE-DIAGNOSTIC',
  )
  await page.getByRole('link', { name: 'Учебный терминал', exact: true }).click()
  await page.getByRole('button', { name: 'Сохранить контрольную точку', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Подтвердите')
  await page.getByLabel('Подтверждаю сохранение состояния учебной среды', { exact: false }).check()
  await page.getByRole('button', { name: 'Сохранить контрольную точку', exact: true }).click()
  await expect(page.getByText('Контрольная точка сохранена.', { exact: false })).toBeVisible()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать контрольную точку JSON', exact: true }).click()
  const text = await readFile((await (await downloaded).path())!, 'utf8')
  expect(text).not.toContain('PRIVATE-')
  expect(JSON.parse(text).environment.dns).toBe('192.0.2.53')
  await page.getByLabel('Импорт контрольной точки').setInputFiles({
    name: 'checkpoint.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  })
  await page.getByRole('button', { name: 'Восстановить учебную среду', exact: true }).click()
  await expect(page.locator('.terminal-records li')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.terminal-records li')).toHaveCount(0)
  await page.getByRole('button', { name: 'Загрузить контрольную точку', exact: true }).click()
  await page.getByRole('button', { name: 'Восстановить учебную среду', exact: true }).click()
  await expect(page.locator('.terminal-records li')).toHaveCount(0)
  await page.getByLabel('Простой ввод и текстовый вывод').check()
  await run(page, 'ipconfig /all')
  await expect(page.locator('.terminal-records li').first()).toContainText('192.0.2.53')
  await page.getByLabel('Импорт контрольной точки').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":99}'),
  })
  await expect(page.getByRole('alert')).toContainText('Неподдерживаемая')
  expect(outgoing).toEqual([])
})
test('xterm keyboard editing, completion and history execute through the virtual engine', async ({
  page,
}) => {
  await page.goto('/#/terminal?lab=TERM-ICMP-TCP')
  const input = page.locator('.xterm-helper-textarea')
  await input.focus()
  await page.keyboard.type('ipconfig /al')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(page.locator('.terminal-records li').first()).toContainText('ipconfig /all')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter')
  await expect(page.locator('.terminal-records li')).toHaveCount(2)
  await page.keyboard.type('help')
  await page.keyboard.press('Control+c')
  await page.keyboard.press('Enter')
  await expect(page.locator('.terminal-records li')).toHaveCount(2)
  await input.evaluate((element) => {
    // Firefox protects a synthetic DataTransfer's data store. Supply the clipboard
    // payload explicitly while still dispatching through xterm's real paste handler.
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: {
        getData: (type: string) => (type === 'text/plain' ? 'help\nipconfig /flushdns' : ''),
      },
    })
    element.dispatchEvent(event)
  })
  await expect(page.locator('.terminal-records li')).toHaveCount(2)
  await page.keyboard.press('Enter')
  await expect(page.locator('.terminal-records li')).toHaveCount(3)
  await expect(page.locator('.terminal-records li').first()).toContainText('не поддерживается')
})
test('terminal is responsive and has no serious accessibility violations in either input mode', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/#/terminal')
  for (const simple of [false, true]) {
    if (simple) await page.getByLabel('Простой ввод и текстовый вывод').check()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    const result = await new AxeBuilder({ page }).analyze()
    expect(
      result.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')),
    ).toEqual([])
  }
  await page.getByRole('button', { name: 'Включить светлую тему' }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})
test('plain input remains usable if graphical terminal initialization fails', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'ResizeObserver', { value: undefined, configurable: true }),
  )
  await page.goto('/#/terminal')
  await expect(page.getByText('Графический терминал недоступен.', { exact: false })).toBeVisible()
  await expect(page.getByLabel('Простой ввод и текстовый вывод')).toBeChecked()
  await run(page, 'ipconfig /all')
  await expect(page.locator('.terminal-records li').first()).toContainText('192.0.2.54')
})
for (const root of ['http://127.0.0.1:4173/', 'http://127.0.0.1:4174/preview/site/']) {
  test(`terminal lab works offline at ${root}`, async ({ page, context }) => {
    await page.goto(`${root}#/settings`)
    await page.getByRole('button', { name: 'Включить офлайн-доступ' }).click()
    await expect(page.getByText('ОФЛАЙН-ДОСТУП ВКЛЮЧЁН', { exact: true })).toBeVisible()
    await expect(
      page.getByText(
        'Офлайн-доступ включён. Файлы приложения сохранены; пользовательские логи не кешируются.',
        { exact: true },
      ),
    ).toBeVisible()
    await page.reload()
    // load does not wait for Vue's initial lazy route. Changing the hash too early
    // lets that navigation overwrite the terminal route, especially in Firefox.
    await expect(
      page.getByRole('heading', { name: 'Ваше рабочее место.', exact: true }),
    ).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state))
      .toBe('activated')
    await context.setOffline(true)
    await page.goto(`${root}#/terminal?lab=TERM-DNS-CACHE`)
    await page.getByLabel('Простой ввод и текстовый вывод').check()
    // Also exercise a full document load from the offline cache, not only a hash change.
    await page.reload()
    await page.getByLabel('Простой ввод и текстовый вывод').check()
    await run(page, 'ipconfig /displaydns')
    await expect(page.locator('.terminal-records li').first()).toContainText('198.51.100.99')
    await run(page, 'ipconfig /flushdns')
    await run(page, tcp)
    await expect(page.locator('.terminal-records li').first()).toContainText('192.0.2.20')
  })
}
