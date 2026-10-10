import { mkdir, writeFile, stat } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

// Only a new, explicit directory outside existing repositories is allowed.
const target = process.argv[2] && resolve(process.argv[2])
if (!target) throw new Error('Укажите новый путь: node create.mjs /private/tmp/workbench-git-case')
if (
  await stat(target).then(
    () => true,
    () => false,
  )
)
  throw new Error('Путь уже существует. Выберите новую папку; данные не перезаписываются.')
await stat(dirname(target))
let insideRepository = false
try {
  execFileSync('git', ['-C', dirname(target), 'rev-parse', '--show-toplevel'], { stdio: 'ignore' })
  insideRepository = true
} catch {
  /* Parent is outside Git. */
}
if (insideRepository)
  throw new Error('Учебный стенд создаётся за пределами существующего Git-репозитория.')
await mkdir(target)
function git(...args) {
  return execFileSync(
    'git',
    ['-c', 'user.name=Workbench Learner', '-c', 'user.email=learner@example.invalid', ...args],
    { cwd: target, encoding: 'utf8' },
  )
}
git('init', '--initial-branch=main')
await writeFile(
  resolve(target, 'config.json'),
  JSON.stringify({ timeout: 3, retries: 1 }, null, 2) + '\n',
)
await writeFile(
  resolve(target, 'check.mjs'),
  `import { readFileSync } from 'node:fs'\nimport assert from 'node:assert/strict'\nconst c = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8'))\nassert(c.timeout >= 5 && c.timeout <= 10, 'timeout должен укладываться в 5–10 секунд')\nassert.equal(c.retries, 2, 'приложению нужны две попытки')\nconsole.log('Две проверки содержимого пройдены')\n`,
)
git('add', '.')
git('commit', '-m', 'chore: prepare synthetic configuration')
git('tag', 'lab-start')
git('switch', '-c', 'retry-policy')
await writeFile(
  resolve(target, 'config.json'),
  JSON.stringify({ timeout: 8, retries: 2 }, null, 2) + '\n',
)
git('add', 'config.json')
git('commit', '-m', 'fix: bound timeout and retry failed requests')
git('switch', 'main')
await writeFile(
  resolve(target, 'config.json'),
  JSON.stringify({ timeout: 5, retries: 1 }, null, 2) + '\n',
)
git('add', 'config.json')
git('commit', '-m', 'fix: increase service timeout')
process.stdout.write(
  `Стенд создан: ${target}\nДве ветки изменяют одни строки; локальная проверка: node check.mjs.\n`,
)
