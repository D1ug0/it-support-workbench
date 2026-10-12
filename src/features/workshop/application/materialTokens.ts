import type { MaterialTokens } from './workshopRepository'

export function tokensFromRows(
  rows: readonly { id: string; storageToken?: string | null }[],
): MaterialTokens {
  return Object.fromEntries(rows.map((row) => [row.id, row.storageToken ?? null]))
}
