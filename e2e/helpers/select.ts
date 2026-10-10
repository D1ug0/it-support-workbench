import { expect, type Locator, type Page } from '@playwright/test'

/** Exercise the actual accessible dropdown, including its portalled menu. */
export async function chooseOption(
  page: Page,
  trigger: Locator,
  selection: string | { label: string } | { index: number },
) {
  await trigger.click()
  const menu = page.getByRole('listbox')
  await expect(menu).toBeVisible()
  const target =
    typeof selection === 'string'
      ? menu.locator(`[role="option"][data-value=${JSON.stringify(selection)}]`)
      : 'label' in selection
        ? menu.getByRole('option', { name: selection.label, exact: true })
        : menu.getByRole('option').nth(selection.index)
  const value = await target.getAttribute('data-value')
  await target.click()
  await expect(menu).not.toBeVisible()
  if (value !== null) await expect(trigger).toHaveAttribute('data-value', value)
}
