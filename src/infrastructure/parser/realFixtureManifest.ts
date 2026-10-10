import { z } from 'zod'
const filename = z.string().regex(/^[a-z0-9][a-z0-9-]{1,100}\.(txt|json)$/)
export const realFixtureManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    captures: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9-]{3,80}$/),
            provenance: z.literal('real-redacted'),
            file: filename,
            expectedFile: filename,
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            os: z
              .object({
                name: z.string().min(3).max(80),
                version: z.string().min(1).max(40),
                build: z.string().min(1).max(40),
              })
              .strict(),
            shellVersion: z.string().min(1).max(60),
            locale: z.enum(['ru-RU', 'en-US']),
            capturedAt: z.iso.datetime(),
            command: z.enum([
              'ipconfig',
              'ping',
              'tracert',
              'route',
              'nslookup',
              'dns-records',
              'powershell',
            ]),
            invocation: z.string().min(3).max(600),
            scenario: z.enum(['minimal', 'problematic']),
            reviewed: z.literal(true),
            ownEnvironment: z.literal(true),
            redactionNotes: z.string().min(20).max(1200),
          })
          .strict(),
      )
      .max(100),
  })
  .strict()
  .superRefine((m, ctx) => {
    for (const key of ['id', 'file', 'expectedFile'] as const)
      if (new Set(m.captures.map((c) => c[key])).size !== m.captures.length)
        ctx.addIssue({ code: 'custom', message: `Повтор capture ${key}` })
  })
export function assertFixturePrivacy(text: string) {
  if (
    /-----BEGIN .*PRIVATE KEY-----|\bBearer\s+\S+|(?:password|token|secret)\s*[=:]\s*\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(
      text,
    )
  )
    throw new Error(
      'Fixture содержит потенциальный секрет или email; требуется ручное обезличивание.',
    )
  // This detects obvious leaks; manual review is required for names, addresses and identifiers.
}
