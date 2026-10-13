import { spawnSync } from 'node:child_process'
import process from 'node:process'
import console from 'node:console'

const features = {
  terminal: {
    unit: ['src/features/terminal'],
    browser: ['e2e/terminal.spec.ts', 'e2e/evolution.spec.ts'],
  },
  workshop: {
    unit: ['src/features/workshop', 'src/features/learning'],
    browser: [
      'e2e/architecture.spec.ts',
      'e2e/evolution.spec.ts',
      'e2e/audit.spec.ts',
      'e2e/audit-fixes.spec.ts',
      'e2e/remediation.spec.ts',
    ],
  },
  parsers: {
    unit: ['src/domain/diagnostics/parsers', 'src/domain/rules'],
    browser: ['e2e/analyzer.spec.ts'],
  },
  companion: {
    server: true,
    unit: [
      'src/features/workshop/infrastructure/companion.test.ts',
      'src/shared/companionOrigins.test.ts',
    ],
    browser: ['e2e/workshop.spec.ts'],
    grep: 'companion UI',
  },
}
const [name, ...flags] = process.argv.slice(2)
if (!Object.hasOwn(features, name ?? '') || flags.some((f) => f !== '--browser')) {
  console.error(
    'Использование: npm run check:feature -- terminal|workshop|parsers|companion [--browser]',
  )
  process.exit(1)
}
const npmCli = process.env.npm_execpath
if (!npmCli) {
  console.error('Запустите через npm run check:feature, чтобы использовать локальные зависимости.')
  process.exit(1)
}
function run(args) {
  // Running the npm JS entrypoint also works on Windows without executing a .cmd shell.
  const result = spawnSync(process.execPath, [npmCli, ...args], { stdio: 'inherit', shell: false })
  if (result.error) console.error(result.error.message)
  if (result.status !== 0) process.exit(result.status ?? 1)
}
const feature = features[name]
run(['exec', '--no', '--', 'vitest', 'run', ...feature.unit])
if (feature.server) run(['run', 'test:companion'])
if (flags.includes('--browser')) {
  run(['run', 'build'])
  run([
    'exec',
    '--no',
    '--',
    'playwright',
    'test',
    ...feature.browser,
    '--project=chromium',
    ...(feature.grep ? ['--grep', feature.grep] : []),
  ])
}
