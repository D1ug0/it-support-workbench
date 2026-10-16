/** Parse an unsigned decimal field from command output without coercing other number formats. */
export function parseDecimalCounter(value: string, max = 0xffffffff): number | undefined {
  if (!/^\d+$/.test(value)) return undefined
  const number = Number(value)
  return Number.isSafeInteger(number) && number <= max ? number : undefined
}
