import { chooseOption } from './helpers/select'
import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
const dbName = 'it-support-workbench-workshop'
async function rows(page: Page, table: string) {
  return page.evaluate(
    async ({ name, table }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open(name)
        r.onsuccess = () => resolve(r.result)
        r.onerror = () => reject(r.error)
      })
      try {
        return await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
          const r = db.transaction(table).objectStore(table).getAll()
          r.onsuccess = () => resolve(r.result)
          r.onerror = () => reject(r.error)
        })
      } finally {
        db.close()
      }
    },
    { name: dbName, table },
  )
}
async function saveIncident(page: Page) {
  await page.getByLabel('Проверил заметки: только учебные данные').check()
  await page.getByRole('button', { name: 'Сохранить попытку инцидента', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Конкретная попытка сохранена' }),
  ).toBeVisible()
}
async function act(page: Page, action: string) {
  await chooseOption(page, page.getByLabel('Следующая проверка или действие'), action)
  await page
    .getByLabel('Гипотеза и обоснование')
    .fill('Сравниваю проверку с учебными данными и масштабом отказа.')
  await page.getByRole('button', { name: 'Выполнить учебное действие' }).click()
}
test('one leave confirmation keeps the terminal URL and displayed lab consistent on accept and cancel', async ({
  page,
}) => {
  await page.goto('/#/terminal?lab=TERM-DNS-SERVER')
  await expect(
    page.getByRole('heading', { name: 'Неверный DNS-сервер', exact: true }),
  ).toBeVisible()
  await page
    .getByLabel('Симптом', { exact: true })
    .fill('Несохранённый симптом прежней лаборатории.')
  let dialogs = 0,
    accept = false
  page.on('dialog', async (dialog) => {
    dialogs++
    if (accept) await dialog.accept()
    else await dialog.dismiss()
  })
  await page.evaluate(() => {
    location.hash = '/terminal?lab=TERM-DHCP'
  })
  await expect(page).toHaveURL(/lab=TERM-DNS-SERVER/)
  await expect(page.getByLabel('Симптом', { exact: true })).toHaveValue(
    'Несохранённый симптом прежней лаборатории.',
  )
  expect(dialogs).toBe(1)
  accept = true
  await page.evaluate(() => {
    location.hash = '/terminal?lab=TERM-DHCP'
  })
  await expect(
    page.getByRole('heading', { name: 'DHCP: адрес не получен', exact: true }),
  ).toBeVisible()
  await expect(page).toHaveURL(/lab=TERM-DHCP/)
  await expect(page.getByLabel('Симптом', { exact: true })).toHaveValue('')
  expect(dialogs).toBe(2)
})
test('saved incident and unsaved working explanation return to the same attempt', async ({
  page,
}) => {
  await page.goto('/#/learning?view=workshop&workshop=professional&incident=portal')
  await act(page, 'clarify')
  await act(page, 'scope')
  await saveIncident(page)
  const id = (await rows(page, 'professionalAttempts'))[0]!.id as string
  await page.getByRole('link', { name: 'Повторить объяснение и вернуться к этой попытке' }).click()
  await expect(page).toHaveURL(new RegExp(`returnAttempt=${id}`))
  await page.getByRole('link', { name: `Вернуться к инциденту ${id}` }).click()
  await expect(page).toHaveURL(new RegExp(`attempt=${id}`))
  await expect(page.getByText('Симптом получен в 10:05;', { exact: false })).toBeVisible()
  await page
    .getByLabel('Гипотеза и обоснование')
    .fill('Новая несохранённая гипотеза должна остаться в памяти.')
  page.once('dialog', (d) => d.accept())
  await page.getByRole('link', { name: 'Повторить объяснение и вернуться к этой попытке' }).click()
  await page.getByRole('link', { name: `Вернуться к инциденту ${id}` }).click()
  await expect(page.getByLabel('Гипотеза и обоснование')).toHaveValue(
    'Новая несохранённая гипотеза должна остаться в памяти.',
  )
  await expect(page).toHaveURL(new RegExp(`attempt=${id}`))
})
test('two real IndexedDB tabs cannot silently overwrite a professional attempt', async ({
  page,
  context,
}) => {
  await page.goto('/#/learning?view=workshop&workshop=professional&incident=portal')
  await saveIncident(page)
  const url = page.url(),
    second = await context.newPage()
  await second.goto(url)
  await expect(second.getByLabel('Симптом и масштаб', { exact: true })).toHaveValue('')
  await page
    .getByLabel('Симптом и масштаб', { exact: true })
    .fill('Доказательство первой вкладки сохраняется без перезаписи.')
  await saveIncident(page)
  await second
    .getByLabel('Гипотезы', { exact: true })
    .fill('Текст устаревшей вкладки остаётся доступен для экспорта.')
  await second.getByLabel('Проверил заметки: только учебные данные').check()
  await second.getByRole('button', { name: 'Сохранить попытку инцидента', exact: true }).click()
  await expect(second.getByRole('alert')).toContainText('другой вкладке')
  await expect(second.getByLabel('Гипотезы', { exact: true })).toHaveValue(
    'Текст устаревшей вкладки остаётся доступен для экспорта.',
  )
  expect((await rows(page, 'professionalAttempts'))[0]!.report).toMatchObject({
    symptom: 'Доказательство первой вкладки сохраняется без перезаписи.',
    hypothesis: '',
  })
  second.once('dialog', (d) => d.accept())
  await second.getByRole('button', { name: 'Перечитать сохранённую попытку' }).click()
  await expect(second.getByLabel('Симптом и масштаб', { exact: true })).toHaveValue(
    'Доказательство первой вкладки сохраняется без перезаписи.',
  )
  await expect(second.getByRole('combobox', { name: 'Инцидент', exact: true })).toHaveAttribute(
    'data-value',
    'portal',
  )
  // Equal note content after restore must still invalidate every old tab token.
  let unexpectedDialogs = 0
  page.on('dialog', (d) => {
    unexpectedDialogs++
    return d.dismiss()
  })
  await page.evaluate(() => {
    location.hash = '/settings'
  })
  await expect(
    page.getByRole('heading', { name: 'Ваше рабочее место.', exact: true }),
  ).toBeVisible()
  expect(unexpectedDialogs).toBe(0)
  await page.getByLabel('Проверил учебную копию: в заметках нет чувствительных данных').check()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать общую учебную копию', exact: true }).click()
  const buffer = await readFile((await (await download).path())!)
  await page
    .getByLabel('Открыть общую учебную копию', { exact: true })
    .setInputFiles({ name: 'same-backup.json', mimeType: 'application/json', buffer })
  await page
    .getByLabel('Подтверждаю замену учебных коллекций; текущую копию сохранил при необходимости')
    .check()
  await page.getByRole('button', { name: 'Восстановить общую учебную копию', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'восстановлена целиком' })).toBeVisible()
  await second
    .getByLabel('Гипотезы', { exact: true })
    .fill('После восстановления старый токен не даёт стереть копию.')
  await second.getByLabel('Проверил заметки: только учебные данные').check()
  await second.getByRole('button', { name: 'Сохранить попытку инцидента', exact: true }).click()
  await expect(second.getByRole('alert')).toContainText('восстановлена из копии')
  await second.close()
})
test('two real IndexedDB tabs protect an investigation draft and retain the rejected text', async ({
  page,
  context,
}) => {
  await page.goto('/#/terminal?lab=TERM-DNS-SERVER')
  await page.getByLabel('Симптом', { exact: true }).fill('Исходный учебный черновик.')
  await page.getByLabel('Проверил заметки: здесь только учебные данные').check()
  await page.getByRole('button', { name: 'Сохранить учебный черновик', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Черновик сохранён вручную' }),
  ).toBeVisible()
  const id = (await rows(page, 'drafts'))[0]!.id as string,
    second = await context.newPage()
  await second.goto(page.url())
  await chooseOption(
    second,
    second.getByRole('combobox', { name: 'Продолжить сохранённый черновик', exact: true }),
    id,
  )
  await expect(second.getByLabel('Симптом', { exact: true })).toHaveValue(
    'Исходный учебный черновик.',
  )
  await page.getByLabel('Симптом', { exact: true }).fill('Обновлённый текст первой вкладки.')
  await page.getByRole('button', { name: 'Сохранить учебный черновик', exact: true }).click()
  await expect
    .poll(async () => ((await rows(page, 'drafts'))[0]!.notes as Record<string, string>).symptom)
    .toBe('Обновлённый текст первой вкладки.')
  await second.getByLabel('Гипотеза', { exact: true }).fill('Локальный текст второй вкладки.')
  await second.getByLabel('Проверил заметки: здесь только учебные данные').check()
  await second.getByRole('button', { name: 'Сохранить учебный черновик', exact: true }).click()
  await expect(second.getByRole('alert')).toContainText('другой вкладке')
  await expect(second.getByLabel('Гипотеза', { exact: true })).toHaveValue(
    'Локальный текст второй вкладки.',
  )
  expect(((await rows(page, 'drafts'))[0]!.notes as Record<string, string>).symptom).toBe(
    'Обновлённый текст первой вкладки.',
  )
  await second.close()
})
test('Git theory locks the first answer and opens the Git stand instead of DNS', async ({
  page,
}) => {
  await page.goto('/#/learning?view=workshop&workshop=packages&package=git&skill=git')
  await expect(
    page.getByRole('heading', { name: 'Git и CI: содержимое и история', exact: true }),
  ).toBeVisible()
  const problem = page.getByRole('article').filter({ hasText: 'История: A—B—C' })
  await problem.getByLabel('Числовой ответ').fill('75')
  await problem.getByRole('button', { name: 'Проверить расчёт' }).click()
  await expect(problem.getByRole('status')).toContainText('Первый ответ ошибочный')
  await expect(problem.getByRole('button', { name: 'Проверить расчёт' })).toBeDisabled()
  await expect(problem.getByRole('status')).toContainText('всего 6')
  await page.getByRole('link', { name: 'Незнакомая итоговая работа' }).click()
  await expect(page.getByLabel('Задание настоящего стенда')).toHaveAttribute('data-value', 'git')
})

test('retained incident notes are guarded when leaving from its lesson, and an explicit final opens a new case', async ({
  page,
}) => {
  await page.goto('/#/learning?view=workshop&workshop=professional&incident=portal')
  await page
    .getByLabel('Гипотеза и обоснование')
    .fill('Эти заметки ещё не сохранены на устройство.')
  let dialogs = 0
  page.on('dialog', (d) => {
    dialogs++
    return d.dismiss()
  })
  await page.getByRole('link', { name: 'Повторить объяснение и вернуться к этой попытке' }).click()
  expect(dialogs).toBe(0)
  await page.evaluate(() => {
    location.hash = '/toolkit'
  })
  await expect(page).toHaveURL(/lesson=DNS/)
  expect(dialogs).toBe(1)
  page.removeAllListeners('dialog')
  page.once('dialog', (d) => d.accept())
  await page.evaluate(() => {
    location.hash = '/learning?view=workshop&workshop=professional&incident=smb&variant=1&new=1'
  })
  await expect(page.getByRole('combobox', { name: 'Инцидент', exact: true })).toHaveAttribute(
    'data-value',
    'smb',
  )
  await expect(
    page.getByRole('combobox', { name: 'Незнакомый вариант', exact: true }),
  ).toHaveAttribute('data-value', '1')
  await expect(
    page.getByRole('heading', { name: 'Доступ к общей папке', exact: true }),
  ).toBeVisible()
})

test('a stale partial stand draft remains exportable without completing a report', async ({
  page,
  context,
}) => {
  await page.goto('/#/learning?view=workshop&workshop=stand&task=git')
  await page.getByLabel('Симптом стенда', { exact: true }).fill('Первоначальные заметки Git.')
  await page.getByLabel('Проверил отчёт стенда: только обезличенные учебные заметки').check()
  await page.getByRole('button', { name: 'Сохранить черновик стенда', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Учебный черновик стенда сохранён' }),
  ).toBeVisible()
  const id = (await rows(page, 'drafts'))[0]!.id as string,
    second = await context.newPage()
  await second.goto(page.url())
  await chooseOption(
    second,
    second.getByRole('combobox', { name: 'Продолжить черновик стенда', exact: true }),
    id,
  )
  await expect(second.getByLabel('Симптом стенда', { exact: true })).toHaveValue(
    'Первоначальные заметки Git.',
  )
  await page
    .getByLabel('Симптом стенда', { exact: true })
    .fill('Обновлённые заметки первой вкладки Git.')
  await page.getByRole('button', { name: 'Сохранить черновик стенда', exact: true }).click()
  await expect
    .poll(async () => ((await rows(page, 'drafts'))[0]!.notes as Record<string, string>).symptom)
    .toBe('Обновлённые заметки первой вкладки Git.')
  await second
    .getByLabel('Гипотеза стенда', { exact: true })
    .fill('Несохранённая гипотеза второй вкладки Git.')
  await second.getByLabel('Проверил отчёт стенда: только обезличенные учебные заметки').check()
  await second.getByRole('button', { name: 'Сохранить черновик стенда', exact: true }).click()
  await expect(second.getByRole('alert')).toContainText('другой вкладке')
  const download = second.waitForEvent('download')
  await second.getByRole('button', { name: 'Экспорт учебных заметок JSON', exact: true }).click()
  const draft = JSON.parse(await readFile((await (await download).path())!, 'utf8'))
  expect(draft.notes.hypothesis).toBe('Несохранённая гипотеза второй вкладки Git.')
  expect(draft.notes.platform).toBe('')
  expect(draft.kind).toBe('stand')
  expect(Object.hasOwn(draft, 'raw')).toBe(false)
  await second.close()
})
