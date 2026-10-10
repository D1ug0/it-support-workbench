import type { z } from 'zod'
export interface ProblemRecord {
  collection: string
  id: string
  reason: string
  raw: unknown
}
export function loadCollection<T>(
  collection: string,
  rows: readonly unknown[],
  schema: z.ZodType<T>,
  unwrap = false,
) {
  const valid: T[] = [],
    problems: ProblemRecord[] = []
  for (const raw of rows) {
    const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    const parsed = schema.safeParse(unwrap ? row.value : raw)
    if (parsed.success) valid.push(parsed.data)
    else
      problems.push({
        collection,
        id: String(row.id ?? 'без ID'),
        reason: parsed.error.issues.map((i) => i.message).join('; '),
        raw,
      })
  }
  return { valid, problems }
}
