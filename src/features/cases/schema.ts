import { z } from 'zod'
export const caseSchema = z
  .object({
    id: z.uuid(),
    title: z.string().min(1).max(100),
    command: z.enum(['ipconfig', 'ping', 'nslookup', 'tracert', 'route']),
    createdAt: z.iso.datetime(),
    report: z.string().min(1).max(500_000),
  })
  .strict()
export type LocalCase = z.infer<typeof caseSchema>
export const caseBundleSchema = z
  .object({ schemaVersion: z.literal(1), cases: z.array(caseSchema).max(100) })
  .strict()
  .refine((bundle) => new Set(bundle.cases.map((item) => item.id)).size === bundle.cases.length, {
    message: 'Duplicate case IDs',
  })
export function parseCaseBundle(text: string) {
  if (new TextEncoder().encode(text).length > 2 * 1024 * 1024)
    throw new Error('Файл кейсов превышает 2 MiB.')
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('Файл не содержит корректный JSON.')
  }
  const result = caseBundleSchema.safeParse(json)
  if (!result.success)
    throw new Error('Формат кейсов не поддерживается. Нужен schemaVersion: 1 с допустимыми полями.')
  return result.data.cases
}
