import { test, expect } from '@playwright/test'

const editors = [
  {
    tab: 'editor',
    consent: 'В пакете только вымышленные учебные данные',
    save: 'Сохранить лабораторию',
    remove: 'Удалить лабораторию',
    table: 'labs',
  },
  {
    tab: 'course-editor',
    consent: 'Подтверждаю авторский учебный материал без',
    save: 'Сохранить авторский курс',
    remove: 'Удалить авторский курс',
    table: 'courses',
  },
  {
    tab: 'graphs',
    consent: 'Сценарий содержит только учебные данные',
    save: 'Сохранить граф',
    remove: 'Удалить граф',
    table: 'graphs',
  },
]

for (const editor of editors) {
  test(`can save ${editor.table} again after explicitly deleting the same material`, async ({
    page,
  }) => {
    page.on('dialog', (dialog) => dialog.accept())
    await page.goto(`/#/learning?view=workshop&mode=author&workshop=${editor.tab}`)
    await page.getByLabel(editor.consent, { exact: false }).check()
    const save = page.getByRole('button', { name: editor.save, exact: true })
    const remove = page.getByRole('button', { name: editor.remove, exact: true })
    await save.click()
    await expect(remove).toHaveCount(1)
    await remove.click()
    await expect(remove).toHaveCount(0)
    await save.click()
    await expect(remove).toHaveCount(1)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await page.reload()
    await expect(remove).toHaveCount(1)
  })
}
