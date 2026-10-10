import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
import { academyCourses } from '../src/features/academy/catalog'
import { questions } from '../src/features/learning/questions'

test('advanced lab explains mistakes, uses hints and exports a complete local debrief', async ({
  page,
}) => {
  await page.goto('/#/learning?course=tls')
  const course = academyCourses[0]!
  const lab = page.getByRole('region', { name: `Лабораторная: ${course.title}` })
  await expect(page.getByRole('heading', { name: 'Продвинутый курс', exact: true })).toBeVisible()
  await expect(page.getByLabel('Сохранять учебный прогресс на этом устройстве')).not.toBeChecked()
  await lab.getByRole('button', { name: 'Показать подсказку', exact: true }).click()
  await expect(lab).toContainText(course.lab.questions[0]!.hint)
  for (const [index, q] of course.lab.questions.entries()) {
    const choice = index === 0 ? (q.correct + 1) % q.choices.length : q.correct
    await lab.getByRole('button', { name: q.choices[choice]!, exact: true }).click()
    await expect(lab).toContainText(q.explanation)
    await expect(lab.getByRole('button', { name: q.choices[choice]!, exact: true })).toBeDisabled()
    await lab
      .getByRole('button', {
        name: index === 3 ? 'Показать итог лабораторной' : 'Следующее решение',
        exact: true,
      })
      .click()
  }
  await expect(lab).toContainText('Верных решений: 3 / 4. Подсказок: 1.')
  const download = page.waitForEvent('download')
  await lab.getByRole('button', { name: 'Скачать разбор лабораторной' }).click()
  const report = await readFile((await (await download).path())!, 'utf8')
  expect(report).toContain('Результат: 3/4')
  expect(report).toContain(course.lab.evidence)
  expect(report).toContain(course.lab.questions[0]!.explanation)
  await page.reload()
  await expect(page.locator('.academy-card .tag').first()).toContainText('0 / 4')
})

test('old progress migrates and due advanced questions reuse the review quiz with opt-in persistence', async ({
  page,
}) => {
  await page.goto('/#/learning')
  await page.getByLabel('Сохранять учебный прогресс на этом устройстве').check()
  const q = academyCourses[0]!.lab.questions[0]!
  await page.getByLabel('Импорт учебного прогресса').setInputFiles({
    name: 'legacy.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        answers: { [q.id]: { attempts: 1, correct: 0, lastCorrect: false } },
        scenarios: {},
      }),
    ),
  })
  await page.getByRole('button', { name: 'Применить импорт прогресса' }).click()
  await expect(page.getByRole('heading', { name: 'К повторению сейчас: 1' })).toBeVisible()
  await page.getByRole('link', { name: 'Продвинутый курс', exact: true }).click()
  await page.getByRole('button', { name: 'Повторить по расписанию' }).click()
  const quiz = page.getByRole('region', { name: 'Проверка понимания' })
  await expect(quiz).toContainText(q.prompt)
  await quiz.getByRole('button', { name: q.choices[q.correct]!, exact: true }).click()
  await expect(quiz).toContainText('Следующее повторение:')
  await expect(page.getByRole('heading', { name: 'К повторению сейчас: 0' })).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Экспорт прогресса', exact: true }).click()
  const saved = JSON.parse(await readFile((await (await download).path())!, 'utf8'))
  expect(saved.schemaVersion).toBe(3)
  expect(saved.answers[q.id].attempts).toBe(2)
  expect(saved.reviews[q.id].streak).toBe(1)
  await expect(page.getByTestId('learning-save-status')).toHaveText(
    'Прогресс сохранён на устройстве.',
  )
  await page.reload()
  await expect(page.getByLabel('Сохранять учебный прогресс на этом устройстве')).toBeChecked()
  await expect(page.getByRole('heading', { name: 'К повторению сейчас: 0' })).toBeVisible()
  await expect(page.locator('.learning-metrics strong').last()).toHaveText('2')
})

test('advanced courses are searchable from knowledge and preserve deep links', async ({ page }) => {
  await page.goto('/#/knowledge')
  await page.getByLabel('Поиск по справочнику').fill('Kerberos')
  await page.getByRole('link', { name: 'Урок и лабораторная' }).click()
  await expect(
    page.getByRole('region', { name: 'Урок: Active Directory и Kerberos' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Быстрый поиск (Ctrl или Command K)' }).click()
  await page.getByLabel('Поиск разделов и знаний').fill('SMB и права')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('region', { name: 'Урок: SMB и права доступа' })).toBeVisible()
  await expect(page.getByLabel('Учебные свидетельства')).toContainText(
    '\\\\files.lab.example\\Reports',
  )
  await page.goto('/#/learning?course=unknown')
  await expect(page.getByRole('button', { name: 'Начать тест', exact: true })).toBeVisible()
  expect(questions.length).toBe(30)
})

test('all advanced lessons fit narrow screens with wide fonts and pass serious accessibility checks', async ({
  page,
}) => {
  test.setTimeout(90_000)
  for (const course of academyCourses) {
    await page.setViewportSize({ width: 360, height: 800 })
    await page.goto(`/#/learning?course=${course.id}`)
    await expect(page.getByRole('region', { name: `Урок: ${course.title}` })).toBeVisible()
    await page.evaluate(() => {
      document.documentElement.style.fontFamily = 'Verdana, sans-serif'
    })
    expect(
      await page.evaluate(
        () =>
          Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <=
          window.innerWidth,
      ),
    ).toBe(true)
  }
  await page.setViewportSize({ width: 1280, height: 900 })
  for (const theme of ['dark', 'light']) {
    if (((await page.locator('html').getAttribute('data-theme')) ?? 'dark') !== theme)
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
})
