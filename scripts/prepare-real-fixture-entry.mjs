import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import console from 'node:console'
import { z } from 'zod'
import {
  realFixtureManifestSchema,
  assertFixturePrivacy,
} from '../src/infrastructure/parser/realFixtureManifest.ts'

const args = process.argv.slice(2)
if (args.length !== 3 || args.includes('--help')) {
  console.error(
    'Использование: node scripts/prepare-real-fixture-entry.mjs metadata.json redacted.txt expected.json\nПроверяет явно подтверждённые метаданные, обезличенный файл и ручной эталон. Печатает запись manifest; файлы и manifest не изменяет.',
  )
  process.exit(args.includes('--help') ? 0 : 2)
}
try {
  const [metadataFile, inputFile, expectedFile] = args
  const text = readFileSync(inputFile, 'utf8')
  if (Buffer.byteLength(text) > 262144) throw new Error('Лимит fixture: 256 KiB.')
  assertFixturePrivacy(text)
  const expectedText = readFileSync(expectedFile, 'utf8')
  if (Buffer.byteLength(expectedText) > 1024 * 1024) throw new Error('Лимит эталона: 1 MiB.')
  assertFixturePrivacy(expectedText)
  z.object({
    status: z.enum(['ok', 'partial', 'unsupported', 'invalid']),
    kind: z.string().max(40),
    value: z.unknown(),
    warnings: z.array(z.string()),
    findings: z.array(z.string()),
  })
    .strict()
    .parse(JSON.parse(expectedText))
  const entry = realFixtureManifestSchema.parse({
    schemaVersion: 1,
    captures: [
      {
        ...JSON.parse(readFileSync(metadataFile, 'utf8')),
        file: basename(inputFile),
        expectedFile: basename(expectedFile),
        sha256: createHash('sha256').update(text).digest('hex'),
      },
    ],
  }).captures[0]
  console.log(JSON.stringify(entry, null, 2))
} catch (error) {
  // Do not echo source text or schema values: captures may still contain private data.
  console.error(
    error instanceof z.ZodError
      ? 'Некорректные метаданные или ручной эталон. Проверьте схему, reviewed и ownEnvironment.'
      : error instanceof Error
        ? error.message
        : 'Ошибка подготовки fixture.',
  )
  process.exit(1)
}
