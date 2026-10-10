import { chooseOption } from './helpers/select'
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
import { questions } from '../src/features/learning/questions'

async function sitePlan(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /^Не открывается сайт/ }).click()
  await page.getByLabel('Только у одного пользователя или устройства').check()
  await page.getByLabel('Один сайт или приложение').check()
  await page.getByRole('button', { name: 'Показать план проверки' }).click()
}
test('guided plan requires answers, adapts to Wi-Fi and exports marks as actions', async ({
  page,
}) => {
  await page.goto('/#/guide')
  await page.getByRole('button', { name: /^Нет доступа к сети/ }).click()
  await expect(page.getByRole('heading', { name: 'Нет доступа к сети', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Показать план проверки' }).click()
  await expect(page.getByRole('alert')).toContainText('Ответьте на оба вопроса')
  await page
    .getByRole('group', { name: 'Кого затронула проблема?' })
    .getByLabel('Пока не знаю')
    .check()
  await page.getByLabel('По Wi-Fi', { exact: true }).check()
  await page.getByRole('button', { name: 'Показать план проверки' }).click()
  await expect(page.getByRole('heading', { name: 'Проверьте выбранную сеть Wi-Fi' })).toBeVisible()
  await page.getByLabel('Этот шаг я выполнил').first().check()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать план', exact: true }).click()
  const download = await downloadPromise
  const text = await readFile((await download.path())!, 'utf8')
  expect(text).toContain('- [x] Уточните')
  expect(text).toContain('не являются результатом автоматической проверки')
  expect(text).toContain('Wi-Fi')
  await page.getByRole('button', { name: 'Изменить ответы' }).click()
  await expect(page.getByLabel('По Wi-Fi', { exact: true })).toBeChecked()
  await page.getByRole('button', { name: 'Показать план проверки' }).click()
  await expect(page.getByLabel('Этот шаг я выполнил').first()).not.toBeChecked()
})
test('USB printing guide links to the correct checklist without suggesting network commands', async ({
  page,
}) => {
  await page.goto('/#/guide')
  await page.getByRole('button', { name: /^Не печатает принтер/ }).click()
  await page.getByLabel('Только у одного пользователя или устройства').check()
  await page.getByLabel('Напрямую по USB').check()
  await page.getByRole('button', { name: 'Показать план проверки' }).click()
  await expect(page.locator('.guide-plan')).not.toContainText('ipconfig')
  await expect(page.locator('.guide-plan')).toContainText('Get-Printer')
  await expect(page.locator('.guide-plan .command-shell')).toHaveText('PowerShell')
  await page.getByRole('link', { name: 'Полный чек-лист', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Печать и очередь', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})
test('guide links select empty-input format and preserve an existing diagnostic input', async ({
  page,
}) => {
  await page.goto('/#/guide')
  await sitePlan(page)
  await page.getByRole('link', { name: 'Разобрать вывод этой команды' }).nth(1).click()
  await expect(page.getByLabel('Формат', { exact: true })).toHaveAttribute('data-value', 'nslookup')
  const source = await readFile('src/fixtures/ping-en.txt', 'utf8')
  await page.getByLabel('Вывод команды').fill(source)
  await page.getByRole('link', { name: 'Помощник диагностики', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'План: Не открывается сайт', exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Разобрать вывод этой команды' }).first().click()
  await expect(page.getByLabel('Вывод команды')).toHaveValue(source)
  await expect(page.getByLabel('Формат', { exact: true })).toHaveAttribute('data-value', 'nslookup')
  await page.getByRole('link', { name: 'Помощник диагностики', exact: true }).click()
  await page.getByLabel('Этот шаг я выполнил').first().check()
  await page.getByRole('link', { name: 'Учебный пример ситуации' }).click()
  await expect(
    page.getByRole('heading', { name: 'Сайт не открывается по имени', exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Помощник диагностики', exact: true }).click()
  await expect(page.getByLabel('Этот шаг я выполнил').first()).toBeChecked()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Что случилось?', exact: true })).toBeVisible()
  await sitePlan(page)
  await page.getByRole('link', { name: 'Настройки', exact: true }).click()
  page.once('dialog', (dialog) => {
    void dialog.accept()
  })
  await page.getByRole('button', { name: 'Очистить временные данные', exact: true }).click()
  await page.getByRole('link', { name: 'Помощник диагностики', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Что случилось?', exact: true })).toBeVisible()
})
test('plain result links facts to source and glossary is reachable through global search', async ({
  page,
}) => {
  await page.goto('/#/analyzer')
  await chooseOption(page, page.getByLabel('Демопример', { exact: true }), 'ping')
  await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
  const summary = page.getByRole('region', { name: 'Коротко о результате', exact: true })
  await expect(summary).toContainText('ICMP')
  await expect(summary).toContainText('не проверяет TCP')
  await summary.getByRole('button', { name: 'Где это видно в исходнике' }).first().click()
  await expect(page.locator('.source-line.highlighted').first()).toBeVisible()
  await page.getByRole('button', { name: 'Быстрый поиск (Ctrl или Command K)' }).click()
  await page.getByLabel('Поиск разделов и знаний').fill('RTT')
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Найти термин')).toHaveValue('RTT')
  await expect(page.locator('.glossary-grid article')).toHaveCount(1)
  await expect(page.locator('.glossary-grid')).toContainText('не скорость скачивания')
})
test('learning path starts a topic, prioritizes its mistake and opens the selected scenario', async ({
  page,
}) => {
  await page.goto('/#/learning?topic=DNS')
  await expect(page.getByLabel('Тема вопросов')).toHaveAttribute('data-value', 'DNS')
  await page.getByRole('button', { name: '2. Проверить: DNS', exact: true }).click()
  const question = questions.find((question) => question.category === 'DNS')!
  await page
    .getByRole('button', {
      name: question.choices[(question.correct + 1) % question.choices.length]!,
      exact: true,
    })
    .click()
  await expect(page.getByRole('heading', { name: 'Тема: DNS', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Завершить тест', exact: true }).click()
  await page.getByRole('button', { name: 'Разобрать последние ошибки', exact: true }).click()
  await expect(page.locator('.quiz-section')).toContainText('DNS · 1 / 1')
  await page.getByRole('link', { name: 'Разобрать инцидент DNS', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Сайт не открывается по имени', exact: true }),
  ).toBeVisible()
})
test('subnet practice validates format, explains mistakes and counts distinct solved tasks', async ({
  page,
}) => {
  await page.goto('/#/toolkit?practice=subnet')
  await page.getByLabel('Ответ на задание').fill('bad')
  await page.getByRole('button', { name: 'Проверить ответ', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Введите IPv4')
  await page.getByLabel('Ответ на задание').fill('192.0.2.1')
  await page.getByRole('button', { name: 'Проверить ответ', exact: true }).click()
  await expect(page.locator('.practice-feedback')).toContainText('192.0.2.128')
  await page.getByRole('button', { name: 'Решить ещё раз' }).click()
  await page.getByLabel('Ответ на задание').fill('192.0.2.128')
  await page.getByRole('button', { name: 'Проверить ответ', exact: true }).click()
  await expect(page.locator('.practice-feedback')).toContainText('Верно')
  await expect(page.locator('.subnet-practice .tag')).toHaveText('1 / 8 РЕШЕНО')
  await page.getByRole('button', { name: 'Решить ещё раз' }).click()
  await page.getByLabel('Ответ на задание').fill('192.0.2.128')
  await page.getByRole('button', { name: 'Проверить ответ', exact: true }).click()
  await expect(page.locator('.subnet-practice .tag')).toHaveText('1 / 8 РЕШЕНО')
  await page.getByRole('button', { name: 'Следующее задание' }).click()
  await expect(page.getByLabel('Ответ на задание')).toHaveValue('')
})
test('suggested demo requires explicit loading and confirmation before replacing input', async ({
  page,
}) => {
  await page.goto('/#/learning')
  await page.getByRole('link', { name: '3. Разобрать учебный вывод', exact: true }).click()
  await expect(page.getByLabel('Вывод команды')).toHaveValue('')
  await page.getByRole('button', { name: 'Загрузить предложенный пример' }).click()
  await expect(page.getByLabel('Вывод команды')).toHaveValue(/169\.254/)
  await page.getByLabel('Вывод команды').fill('PRIVATE-ORIGINAL-INPUT')
  page.once('dialog', (dialog) => {
    void dialog.dismiss()
  })
  await page.getByRole('button', { name: 'Загрузить предложенный пример' }).click()
  await expect(page.getByLabel('Вывод команды')).toHaveValue('PRIVATE-ORIGINAL-INPUT')
})
for (const route of [
  '/guide',
  '/analyzer?command=nslookup',
  '/knowledge?term=DNS',
  '/toolkit?practice=subnet',
  '/learning',
]) {
  test(`clear workflow at ${route} fits mobile and passes accessibility in both themes`, async ({
    page,
  }) => {
    test.setTimeout(60_000)
    await page.goto(`/#${route}`)
    if (route === '/guide') await sitePlan(page)
    await page.setViewportSize({ width: 360, height: 800 })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(page.getByRole('link', { name: 'О проекте', exact: true })).toBeInViewport({
      ratio: 1,
    })
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
        results.violations.filter(
          (item) => item.impact === 'critical' || item.impact === 'serious',
        ),
      ).toEqual([])
    }
  })
}
