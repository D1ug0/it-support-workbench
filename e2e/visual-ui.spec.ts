import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { chooseOption } from './helpers/select'

const routes = [
  '/',
  '/guide',
  '/analyzer',
  '/sessions',
  '/toolkit',
  '/knowledge',
  '/playbooks',
  '/simulator',
  '/terminal',
  '/learning',
  '/cases',
  '/settings',
  '/about',
  '/learning?view=workshop&workshop=path',
  '/learning?view=workshop&workshop=professional',
  '/learning?view=workshop&workshop=packages',
  '/learning?view=workshop&workshop=stand',
  '/learning?view=workshop&workshop=editor',
]
const titles: Record<string, string> = {
  '/': 'Обзор',
  '/guide': 'Помощник диагностики',
  '/analyzer': 'Анализатор',
  '/sessions': 'Рабочие сессии',
  '/toolkit': 'Инструменты',
  '/knowledge': 'Справочник',
  '/playbooks': 'Чек-листы',
  '/simulator': 'Тренажёр',
  '/terminal': 'Учебный терминал',
  '/learning': 'Учебный центр',
  '/cases': 'Локальные кейсы',
  '/settings': 'Настройки',
  '/about': 'О проекте',
}
const workshopFields: Record<string, string> = {
  path: 'Направление',
  professional: 'Инцидент',
  packages: 'Пакет',
  stand: 'Задание настоящего стенда',
  editor: 'Шаблон',
}
for (const width of [1440, 1024, 768, 390, 320]) {
  for (const theme of ['dark', 'light']) {
    test(`layout at ${width}px in ${theme}: every main page and workshop`, async ({ page }) => {
      test.setTimeout(60000)
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/#/')
      if (theme === 'light')
        await page.getByRole('button', { name: 'Включить светлую тему' }).click()
      for (const route of routes) {
        // Use app navigation so the theme survives and Vue can dispose old panels.
        await page.evaluate((route) => {
          location.hash = route
        }, route)
        await expect(page).toHaveURL(new RegExp(`#${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
        await expect(page).toHaveTitle(new RegExp(titles[route.split('?')[0]!]!))
        const workshop = new URLSearchParams(route.split('?')[1]).get('workshop')
        if (workshop)
          await expect(
            page.getByRole('combobox', { name: workshopFields[workshop]!, exact: true }),
          ).toBeVisible()
        await expect(page.locator('main h1')).toBeVisible()
        await expect
          .poll(async () => page.evaluate(() => document.documentElement.scrollWidth), {
            message: route,
          })
          .toBeLessThanOrEqual(width)
        const clipped = await page
          .locator('main button, main label, main .panel')
          .evaluateAll((elements) =>
            elements
              .filter((e) => {
                if (!e.checkVisibility()) return false
                const tabs = e.closest('.learning-mode-nav')
                if (tabs && getComputedStyle(tabs).overflowX === 'auto') return false
                const r = e.getBoundingClientRect()
                return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1)
              })
              .map((e) => ({ cls: e.className, text: e.textContent?.trim().slice(0, 100) })),
          )
        expect(clipped, route).toEqual([])
      }
    })
  }
}
test('terminal map is vertical, all nodes fit, keyboard select preserves mode and focus', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#/terminal?lab=TERM-DNS-CACHE')
  const map = page.getByRole('region', { name: 'Карта учебной сети' })
  await expect(map.getByRole('heading', { name: 'Карта учебной сети' })).toBeVisible()
  const geometry = await map.evaluate((e) => {
    const title = e.querySelector('h2')!.getBoundingClientRect()
    const cards = e.querySelector('.network-nodes')!.getBoundingClientRect()
    const detail = e.querySelector('.terminal-node-detail')!.getBoundingClientRect()
    return {
      titleBottom: title.bottom,
      cardsTop: cards.top,
      cardsBottom: cards.bottom,
      detailTop: detail.top,
    }
  })
  expect(geometry.cardsTop).toBeGreaterThan(geometry.titleBottom)
  expect(geometry.detailTop).toBeGreaterThanOrEqual(geometry.cardsBottom)
  await map.getByRole('button', { name: /Маршрутизатор/ }).click()
  await expect(map.locator('.terminal-node-detail')).toContainText('Соединяет локальный сегмент')
  await page
    .locator('.terminal-workspace')
    .screenshot({ path: info.outputPath('terminal-dark.png') })
  const mode = page.getByRole('combobox', { name: 'Режим лаборатории', exact: true })
  await mode.press('Enter')
  await page.getByRole('option', { name: 'Обучение с подсказками', exact: true }).press('End')
  await page.getByRole('option', { name: 'Проверочная работа', exact: true }).press('Enter')
  await expect(mode).toHaveAttribute('data-value', 'exam')
  await expect(map).toContainText('В проверочной работе путь исследуется командами')
  await mode.press('Enter')
  await page.getByRole('option', { name: 'Проверочная работа', exact: true }).press('Escape')
  await expect(mode).toBeFocused()
  await expect(mode).toHaveAttribute('data-value', 'exam')
  await page.getByLabel('Простой ввод и текстовый вывод').check()
  await page.getByLabel('Команда учебного терминала', { exact: true }).fill('help')
  await page.getByRole('button', { name: 'Выполнить в учебной среде', exact: true }).click()
  await expect(mode).toBeDisabled()
})
test('select in light analyzer: long text, menu edges, reset, modal and accessibility', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1024, height: 800 })
  await page.goto('/#/analyzer')
  await page.getByRole('button', { name: 'Включить светлую тему' }).click()
  const format = page.getByRole('combobox', { name: 'Формат', exact: true })
  await chooseOption(page, format, 'powershell')
  await expect(format).toContainText('PowerShell JSON')
  await format.click()
  const menu = page.getByRole('listbox')
  const bounds = await menu.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1024)
  const axe = await new AxeBuilder({ page })
    .include('.app-select-content')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  expect(axe.violations).toEqual([])
  await page.screenshot({ path: info.outputPath('analyzer-light-select.png') })
  await page
    .getByRole('option', { name: 'PowerShell JSON · TCP / IP-конфигурация', exact: true })
    .press('Escape')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await chooseOption(page, page.getByRole('combobox', { name: 'Демопример', exact: true }), 'ping')
  await expect(format).toHaveAttribute('data-value', 'auto')
  await expect(page.getByLabel('Вывод команды')).not.toHaveValue('')
  await chooseOption(page, page.getByRole('combobox', { name: 'Демопример', exact: true }), '')
  await page.getByRole('button', { name: 'Проанализировать', exact: true }).click()
  await page.getByRole('button', { name: 'Отчёт', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await chooseOption(page, dialog.getByRole('combobox', { name: 'Формат', exact: true }), 'txt')
  await expect(dialog.getByRole('combobox', { name: 'Формат', exact: true })).toContainText(
    'Текст (.txt)',
  )
  await expect(new AxeBuilder({ page }).analyze().then((r) => r.violations)).resolves.toEqual([])
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Очистить всё', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Демопример', exact: true })).toHaveAttribute(
    'data-value',
    '',
  )
})
test('numeric incident variants stay numeric; selection cannot submit the form', async ({
  page,
}) => {
  await page.goto('/#/learning?view=workshop&workshop=professional&incident=portal')
  await chooseOption(
    page,
    page.getByRole('combobox', { name: 'Незнакомый вариант', exact: true }),
    '2',
  )
  await page.getByRole('button', { name: 'Начать профессиональный инцидент', exact: true }).click()
  await expect(
    page.getByRole('combobox', { name: 'Незнакомый вариант', exact: true }),
  ).toHaveAttribute('data-value', '2')
  await expect(
    page.getByRole('heading', { name: 'Портал недоступен части клиентов', exact: true }),
  ).toBeVisible()
  const next = page.getByRole('combobox', { name: 'Следующая проверка или действие', exact: true })
  await chooseOption(page, next, 'scope')
  const incident = page.locator('.feature-section').filter({
    has: page.getByRole('heading', { name: 'Сквозные профессиональные инциденты', exact: true }),
  })
  await expect(incident.locator(':scope > ol > li')).toHaveCount(0)
  await page.getByLabel('Проверил заметки: только учебные данные').check()
  await page.getByRole('button', { name: 'Сохранить попытку инцидента', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Конкретная попытка сохранена' }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('combobox', { name: 'Незнакомый вариант', exact: true }),
  ).toHaveAttribute('data-value', '2')
})
