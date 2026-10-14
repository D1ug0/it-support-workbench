import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const pending: Array<{ resolve: () => void; reject: () => void }> = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () =>
          new Promise<void>((resolve, reject) => {
            pending.push({ resolve, reject: () => reject(new Error('Clipboard denied')) })
          }),
      },
    })
    Object.assign(window, {
      completeClipboard: (index: number, success: boolean) => {
        const operation = pending[index]
        if (!operation) throw new Error('Missing clipboard operation')
        if (success) operation.resolve()
        else operation.reject()
      },
    })
  })
  await page.goto('/#/analyzer')
  await page.locator('details.command-help > summary').click()
})

async function finishCopy(page: Page, index: number, success: boolean) {
  await page.evaluate(
    ({ index, success }) => {
      const controls = window as typeof window & {
        completeClipboard: (index: number, success: boolean) => void
      }
      controls.completeClipboard(index, success)
    },
    { index, success },
  )
}

test('a late clipboard success cannot replace the latest error announcement', async ({ page }) => {
  const command = page.locator('.command-help-grid > div').first()
  const button = command.getByRole('button')
  await button.click()
  await button.click()
  await finishCopy(page, 1, false)
  await expect(command.getByRole('status')).toContainText('Не удалось скопировать')
  await finishCopy(page, 0, true)
  await expect(command.getByRole('status')).toContainText('Не удалось скопировать')
  await expect(button).toHaveText('Копировать')
})

test('a late clipboard failure cannot replace the latest success announcement', async ({
  page,
}) => {
  const command = page.locator('.command-help-grid > div').first()
  const button = command.getByRole('button')
  await button.click()
  await button.click()
  await finishCopy(page, 1, true)
  await expect(command.getByRole('status')).toHaveText('Команда скопирована в буфер обмена.')
  await finishCopy(page, 0, false)
  await expect(command.getByRole('status')).toHaveText('Команда скопирована в буфер обмена.')
  await expect(button).toHaveText('Скопировано')
})
