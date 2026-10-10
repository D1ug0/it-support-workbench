import { chooseOption } from './helpers/select'
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
async function workshop(page: Page, tab = 'path') {
  await page.goto(`/#/learning?view=workshop&workshop=${tab}`)
  await expect(page.getByRole('heading', { name: 'Практикум развития', exact: true })).toBeVisible()
}
async function run(page: Page, command: string) {
  await page.getByLabel('Команда учебного терминала', { exact: true }).fill(command)
  await page.getByRole('button', { name: 'Выполнить в учебной среде', exact: true }).click()
  await expect(page.locator('.terminal-records li').first()).toContainText(command)
}
const saveLabel = 'Сохранять навыки и результаты практикума на устройстве'
test('baseline and lesson position persist only with explicit opt-in; opt-out survives reload', async ({
  page,
}) => {
  await workshop(page, 'baseline')
  await page.getByLabel(saveLabel, { exact: true }).check()
  await page.getByRole('button', { name: 'Начать проверку направления' }).click()
  await page
    .getByRole('button', {
      name: 'Нужно исследовать получение адреса; причина пока неизвестна',
      exact: true,
    })
    .click()
  await expect(
    page.getByRole('status').filter({ hasText: 'DHCP и план адресации: верно' }),
  ).toBeVisible()
  await page.getByLabel(saveLabel, { exact: true }).uncheck()
  await page.reload()
  await expect(page.getByLabel(saveLabel, { exact: true })).not.toBeChecked()
  await page.goto('/#/learning?view=workshop&lesson=DNS')
  await expect(
    page.getByRole('heading', { name: 'DNS: сервер, кэш и тип записи', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Отметить материал изученным' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Знакомство с материалом отмечено' }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'DNS: сервер, кэш и тип записи ✓', exact: true }),
  ).toHaveCount(0)
})
test('custom lab editor saves a strict definition and survives reload without clearing analyzer', async ({
  page,
}) => {
  await workshop(page, 'editor')
  await page.getByLabel('Название лаборатории', { exact: true }).fill('Моя проверка DHCP')
  await page.getByRole('button', { name: 'Сохранить лабораторию', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Подтвердите')
  await page.getByLabel('В пакете только вымышленные учебные данные; сохранить явно').check()
  await page.getByRole('button', { name: 'Сохранить лабораторию', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Лаборатории сохранены' })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Пройти', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Моя проверка DHCP', exact: true })).toContainText(
    'Моя проверка DHCP',
  )
  await page.getByLabel('Простой ввод и текстовый вывод').check()
  await run(page, 'ipconfig /all')
  await expect(page.locator('.terminal-records li').first()).toContainText('169.254.10.10')
  await page.goto('/#/settings')
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Очистить временные данные', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Ваше рабочее место.' })).toBeVisible()
})
test('new network workflow uses evidence, final HTTPS verification and explicit portfolio notes', async ({
  page,
}) => {
  await page.goto('/#/terminal?lab=TERM-TLS-CLOCK')
  await page.getByLabel('Простой ввод и текстовый вывод').check()
  for (const command of [
    'certutil -verify lab.cer',
    'curl -I https://portal.lab.example',
    'w32tm /resync',
    'curl -I https://portal.lab.example',
  ])
    await run(page, command)
  await page
    .getByLabel('Часы клиента не соответствуют времени лаборатории', { exact: true })
    .check()
  await page.getByRole('button', { name: 'Проверить решение', exact: true }).click()
  await expect(page.locator('.terminal-feedback')).toContainText('100/100')
  await page.getByLabel('Симптом', { exact: true }).fill('Учебный HTTPS не открывается')
  await page.getByLabel('Гипотеза', { exact: true }).fill('Часы клиента')
  await page.getByLabel('Повторная проверка', { exact: true }).fill('HTTPS 200 после синхронизации')
  await page.getByLabel('Проверил заметки: здесь только учебные данные').check()
  await page.getByRole('button', { name: 'Сохранить в портфолио', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Учебный отчёт сохранён' })).toBeVisible()
  await workshop(page, 'portfolio')
  await page.getByText('Показать сохранённые заметки', { exact: true }).click()
  await expect(page.locator('.workshop-report-preview')).toContainText(
    'HTTPS 200 после синхронизации',
  )
  await page.reload()
  await page.getByText('Показать сохранённые заметки', { exact: true }).click()
  await expect(page.locator('.workshop-report-preview')).not.toContainText('w32tm /resync')
})
test('branching Git incident validates and exports a debrief; invalid links cannot save', async ({
  page,
}) => {
  await workshop(page, 'graphs')
  await chooseOption(
    page,
    page.getByRole('combobox', { name: 'Готовое расследование', exact: true }),
    'GIT',
  )
  await page.getByRole('button', { name: 'Открыть учебное расследование', exact: true }).click()
  for (const name of [
    'Сравнить SHA и лог проверки PR',
    'Обновить ветку PR подходящим способом и проверить новый запуск',
    'Согласовать итоговый код, убрать маркеры, выполнить проверки и закончить merge',
  ])
    await page.getByRole('button', { name, exact: true }).click()
  await expect(page.getByText('Сценарий завершён', { exact: false })).toContainText('100/100')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Экспорт разбора попытки' }).click()
  expect((await download).suggestedFilename()).toBe('workbench-incident-debrief.md')
  await page.getByText('Расширенное редактирование JSON графа', { exact: true }).click()
  const input = page.getByLabel('Сценарий графа JSON', { exact: true })
  const value = JSON.parse(await input.inputValue())
  value.start = 'missing'
  await input.fill(JSON.stringify(value))
  await page.getByRole('button', { name: 'Проверить и пройти сценарий', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
})
test('traces hide imported content until explicit reveal and enforce size/schema', async ({
  page,
}) => {
  await workshop(page, 'traces')
  const trace = {
    schemaVersion: 1,
    title: 'Ручной экспорт',
    origin: 'manual-export',
    events: [{ time: 0, layer: 'DNS', result: 'failure', detail: 'PRIVATE-TRACE-MARKER' }],
  }
  await page.getByLabel('Импорт трассы JSON', { exact: true }).setInputFiles({
    name: 'trace.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(trace)),
  })
  await expect(page.getByText('PRIVATE-TRACE-MARKER', { exact: true })).toHaveCount(0)
  await page
    .getByLabel('Показать содержимое событий; оно может содержать чувствительные данные')
    .check()
  await expect(page.getByText('PRIVATE-TRACE-MARKER', { exact: true })).toBeVisible()
  await page.getByLabel('Импорт трассы JSON', { exact: true }).setInputFiles({
    name: 'large.json',
    mimeType: 'application/json',
    buffer: Buffer.alloc(131073, 32),
  })
  await expect(page.getByRole('alert')).toContainText('Лимит 128 KiB')
})
test('workshop is mobile accessible and never automatically contacts companion or AI', async ({
  page,
}) => {
  const outgoing: string[] = []
  page.on('request', (r) => {
    if (new URL(r.url()).host !== '127.0.0.1:4173' || r.method() !== 'GET') outgoing.push(r.url())
  })
  await page.setViewportSize({ width: 375, height: 812 })
  await workshop(page, 'exchange')
  await page.getByRole('button', { name: 'Объяснить по локальным материалам', exact: true }).click()
  await expect(page.getByText('Локальные проверяемые материалы', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).analyze()).violations.filter((v) =>
      ['serious', 'critical'].includes(v.impact ?? ''),
    ),
  ).toEqual([])
  expect(outgoing).toEqual([])
})
test('cursor editing and reverse history search do not execute until Enter', async ({ page }) => {
  await page.goto('/#/terminal?lab=TERM-HTTP')
  await page.locator('.xterm-helper-textarea').focus()
  await page.keyboard.type('ipconfig Xall')
  await page.keyboard.press('Home')
  for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Delete')
  await page.keyboard.type('/')
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await expect(page.locator('.terminal-records li').first()).toContainText('ipconfig /all')
  await page.keyboard.type('help')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Control+r')
  await page.keyboard.press('Control+r')
  await expect(page.locator('.terminal-records li')).toHaveCount(2)
  await page.keyboard.press('Enter')
  await expect(page.locator('.terminal-records li').first()).toContainText('ipconfig /all')
})
test('another tab cannot overwrite a newer saved workshop revision', async ({ page, context }) => {
  await workshop(page)
  const other = await context.newPage()
  await workshop(other)
  await page.getByLabel(saveLabel, { exact: true }).check()
  await page.goto('/#/learning?view=workshop&lesson=DNS')
  await page.getByRole('button', { name: 'Отметить материал изученным' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Знакомство с материалом отмечено' }),
  ).toBeVisible()
  await other.getByLabel(saveLabel, { exact: true }).check()
  await expect(other.getByRole('alert')).toContainText('другой вкладке')
  await other
    .getByRole('button', { name: 'Перечитать сохранённый прогресс вместо текущего' })
    .click()
  await other.goto('/#/learning?view=workshop&lesson=DNS')
  await expect(
    other.getByRole('button', { name: 'DNS: сервер, кэш и тип записи ✓', exact: true }),
  ).toBeVisible()
})

test('teacher compares imported metadata in memory without replacing own progress', async ({
  page,
}) => {
  await workshop(page, 'exchange')
  const progress = {
    schemaVersion: 1,
    attempts: [],
    read: [],
    assessment: { addressing: true },
    track: 'L1',
  }
  await page.getByLabel('Открыть прогресс учеников', { exact: true }).setInputFiles({
    name: 'private-filename.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(progress)),
  })
  await expect(page.getByLabel('Учебный псевдоним', { exact: true })).toHaveValue('Ученик 1')
  await expect(page.getByText('private-filename.json', { exact: true })).toHaveCount(0)
  const overview = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Экспорт обзора группы', exact: true }).click()
  expect((await overview).suggestedFilename()).toBe('workbench-group-overview.md')
  await page
    .getByRole('button', { name: 'Очистить сравнение группы из памяти', exact: true })
    .click()
  await expect(page.getByLabel('Учебный псевдоним', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel(saveLabel, { exact: true })).not.toBeChecked()
})
test('companion UI requires consent and handles a stale remote revision without overwriting it', async ({
  page,
}) => {
  const state = { schemaVersion: 1, attempts: [], read: [], assessment: {}, track: 'L1' }
  const writes: string[] = [],
    requests: string[] = []
  await page.route('http://127.0.0.1:8787/api/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname
    requests.push(path)
    let status = 200,
      body: unknown = { ok: true }
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': 'http://127.0.0.1:4173',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization,If-Match',
          'Access-Control-Allow-Methods': 'GET,POST,PUT',
        },
      })
      return
    }
    if (path === '/api/health') body = { schemaVersion: 1, aiConfigured: false }
    if (path === '/api/accounts')
      body = { schemaVersion: 1, name: 'student', token: 'a'.repeat(64) }
    if (path === '/api/progress' && request.method() === 'GET')
      body = { schemaVersion: 1, revision: 2, state }
    if (path === '/api/progress' && request.method() === 'PUT') {
      writes.push(request.postData() ?? '')
      expect(request.headers()['if-match']).toBe('2')
      status = 409
      body = { error: 'Прогресс изменён на другом устройстве; перечитайте ревизию.' }
    }
    await route.fulfill({
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'http://127.0.0.1:4173',
      },
      body: JSON.stringify(body),
    })
  })
  await workshop(page, 'exchange')
  expect(requests).toEqual([])
  await expect(
    page.getByRole('button', { name: 'Создать учебную учётную запись', exact: true }),
  ).toBeDisabled()
  await page
    .getByLabel('Подключиться к указанному мной сервису и передать учётные данные при входе')
    .check()
  await page.getByLabel('Имя учебной учётной записи', { exact: true }).fill('student')
  await page.getByLabel('Пароль (от 10 символов)', { exact: true }).fill('temporary-test-password')
  await page.getByRole('button', { name: 'Создать учебную учётную запись', exact: true }).click()
  await expect(page.getByText('Подключено: student', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Прочитать прогресс с сервиса', exact: true }).click()
  await page
    .getByRole('button', { name: 'Отправить локальный прогресс в сервис', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('перечитайте ревизию')
  expect(writes).toHaveLength(1)
  expect(JSON.parse(writes[0]!)).toEqual({ ...state, events: [], theoryChecks: [] })
  expect(writes[0]).not.toContain('password')
  await page.getByRole('button', { name: 'Выйти из companion', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Войти в companion', exact: true })).toBeVisible()
})

test('settings restore an orphaned custom checkpoint only after preview and can delete it', async ({
  page,
}) => {
  await workshop(page, 'editor')
  await page.getByLabel('Название лаборатории', { exact: true }).fill('Моё сохранение DHCP')
  await page.getByLabel('В пакете только вымышленные учебные данные; сохранить явно').check()
  await page.getByRole('button', { name: 'Сохранить лабораторию', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Лаборатории сохранены' })).toBeVisible()
  await page.getByRole('button', { name: 'Пройти', exact: true }).click()
  await page.getByLabel('Простой ввод и текстовый вывод').check()
  await run(page, 'ipconfig /all')
  await page.getByLabel('Подтверждаю сохранение состояния учебной среды на этом устройстве').check()
  await page.getByRole('button', { name: 'Сохранить контрольную точку', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Контрольная точка сохранена' }),
  ).toBeVisible()
  await workshop(page, 'editor')
  await page.getByRole('button', { name: 'Удалить лабораторию', exact: true }).click()
  await page.goto('/#/settings')
  await page.getByText('Управлять всеми контрольными точками (1/50)', { exact: true }).click()
  await page.getByRole('link', { name: 'Моё сохранение DHCP', exact: true }).click()
  await expect(page.locator('.terminal-checkpoint-preview')).toContainText('Моё сохранение DHCP')
  await page.getByRole('button', { name: 'Восстановить учебную среду', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Моё сохранение DHCP', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.terminal-records li')).toHaveCount(0)
  await page.getByLabel('Простой ввод и текстовый вывод').check()
  await run(page, 'ipconfig /all')
  await expect(page.locator('.terminal-records li').first()).toContainText('169.254.10.10')
  await page.goto('/#/settings')
  await page.getByText('Управлять всеми контрольными точками (1/50)', { exact: true }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page
    .getByRole('button', { name: 'Удалить сохранение Моё сохранение DHCP', exact: true })
    .click()
  await expect(
    page.getByText('Управлять всеми контрольными точками (1/50)', { exact: true }),
  ).toHaveCount(0)
})

test('authored courses survive reload and self-check never changes built-in skill assessment', async ({
  page,
}) => {
  await workshop(page, 'course-editor')
  await page.getByText('Расширенное редактирование JSON курса', { exact: true }).click()
  const input = page.getByLabel('Авторский курс JSON', { exact: true })
  const course = JSON.parse(await input.inputValue())
  course.title = 'Мой разбор DNS'
  course.skill = 'dns'
  course.tracks = ['L1']
  course.labs = ['TERM-DNS-SERVER']
  await input.fill(JSON.stringify(course))
  await page.getByRole('button', { name: 'Сохранить авторский курс', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Подтвердите')
  await page.getByLabel('Подтверждаю авторский учебный материал без чувствительных данных').check()
  await page.getByRole('button', { name: 'Сохранить авторский курс', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Авторские курсы сохранены' }),
  ).toBeVisible()
  await page.reload()
  await page.getByRole('link', { name: 'Изучить авторский курс', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Мой разбор DNS', exact: true })).toBeVisible()
  await expect(
    page.getByText('Авторский материал · самопроверка без изменения встроенной оценки навыка', {
      exact: true,
    }),
  ).toBeVisible()
  await page.getByRole('button', { name: course.options[course.correct], exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Верно.' })).toBeVisible()
  await workshop(page, 'exchange')
  const exported = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Экспорт прогресса практикума', exact: true }).click()
  const download = await exported
  const progress = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(progress.assessment).toEqual({})
  expect(progress.attempts).toEqual([])
  await workshop(page, 'course-editor')
  await page.getByLabel('Импорт авторских курсов', { exact: true }).setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        courses: [{ ...course, source: 'javascript:alert(1)' }],
      }),
    ),
  })
  await expect(page.getByRole('alert')).toBeVisible()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Удалить авторский курс', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Изучить авторский курс', exact: true })).toHaveCount(
    0,
  )
})

test('rollback restores model conditions while retaining review and invalidating final verification', async ({
  page,
}) => {
  await page.goto('/#/terminal?lab=TERM-HTTP')
  await page.getByLabel('Простой ввод и текстовый вывод').check()
  await run(page, 'Get-Service WebApp')
  await run(page, 'curl -I https://portal.lab.example')
  await run(page, 'Set-DnsClientServerAddress -InterfaceIndex 12 -ServerAddresses 192.0.2.54')
  await expect(page.getByText(/Разбор изменений модели:/)).toContainText('ухудшений 1')
  await page
    .getByRole('button', { name: 'Откатить последнее изменение модели', exact: true })
    .click()
  await run(page, 'Restart-Service WebApp')
  await page.getByLabel('Веб-приложение не готово принимать запросы', { exact: true }).check()
  await page.getByRole('button', { name: 'Проверить решение', exact: true }).click()
  await expect(page.locator('.terminal-feedback')).toContainText('Остались проверки')
  await run(page, 'curl -I https://portal.lab.example')
  await page.getByRole('button', { name: 'Проверить решение', exact: true }).click()
  await expect(page.locator('.terminal-feedback')).toContainText('95/100')
})
