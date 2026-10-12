import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import console from 'node:console'
import { URL } from 'node:url'
const manifest = JSON.parse(
  readFileSync(new URL('../src/fixtures/real/manifest.json', import.meta.url), 'utf8'),
)
if (!Array.isArray(manifest.captures) || manifest.captures.length === 0) {
  console.error(
    'Реальные Windows captures отсутствуют. Совместимость по версиям/локалям не подтверждена.',
  )
  process.exit(2)
}
const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('Запускайте через npm run test:fixtures:real')
const result = spawnSync(
  process.execPath,
  [
    npmCli,
    'exec',
    '--no',
    '--',
    'vitest',
    'run',
    'src/domain/diagnostics/parsers/realFixtures.test.ts',
  ],
  { stdio: 'inherit', shell: false },
)
process.exit(result.status ?? 1)
