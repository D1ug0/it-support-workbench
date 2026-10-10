import { DatabaseSync, backup } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { writeFile, readFile, stat, link, chmod, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'
import { workshopProgressSchema } from '../src/features/workshop/skills.ts'
async function checksum(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
export async function verifyDatabase(path) {
  if ((await stat(path)).size > 256 * 1024 * 1024) throw new Error('Лимит копии SQLite: 256 MiB.')
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    if (db.prepare('PRAGMA user_version').get().user_version !== 1)
      throw new Error('Неподдерживаемая версия SQLite.')
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
      throw new Error('Копия SQLite повреждена.')
    if (db.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('Повреждены связи SQLite.')
    for (const table of ['users', 'sessions', 'progress'])
      db.prepare(`SELECT * FROM ${table} LIMIT 1`).all()
    for (const row of db.prepare('SELECT payload FROM progress').all())
      workshopProgressSchema.parse(JSON.parse(row.payload))
  } finally {
    db.close()
  }
}
export async function backupDatabase(source, destination) {
  if (
    resolve(source) === resolve(destination) ||
    existsSync(destination) ||
    existsSync(`${destination}.sha256.json`)
  )
    throw new Error('Выберите новый путь копии; существующие файлы не перезаписываются.')
  await verifyDatabase(source)
  const db = new DatabaseSync(source, { readOnly: true })
  const temporary = `${destination}.tmp-${randomUUID()}`
  try {
    await backup(db, temporary)
    await verifyDatabase(temporary)
    await chmod(temporary, 0o600)
    await link(temporary, destination)
    await writeFile(
      `${destination}.sha256.json`,
      JSON.stringify({
        format: 'workbench-sqlite-backup',
        schemaVersion: 1,
        sha256: await checksum(destination),
      }),
      { flag: 'wx', mode: 0o600 },
    )
  } finally {
    db.close()
    await rm(temporary, { force: true })
  }
}
export async function restoreDatabase(source, destination) {
  const manifest = JSON.parse(await readFile(`${source}.sha256.json`, 'utf8'))
  if (
    manifest.format !== 'workbench-sqlite-backup' ||
    manifest.schemaVersion !== 1 ||
    manifest.sha256 !== (await checksum(source))
  )
    throw new Error('Контрольная сумма копии не совпадает.')
  await backupDatabase(source, destination)
  // Sessions from a recovered database must not revive old bearer tokens.
  const db = new DatabaseSync(destination)
  try {
    db.exec('DELETE FROM sessions; PRAGMA wal_checkpoint(TRUNCATE);')
  } finally {
    db.close()
  }
  await writeFile(
    `${destination}.sha256.json`,
    JSON.stringify({
      format: 'workbench-sqlite-backup',
      schemaVersion: 1,
      sha256: await checksum(destination),
    }),
    { mode: 0o600 },
  )
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [action, source, destination] = process.argv.slice(2)
  try {
    if (
      !source ||
      !['verify', 'backup', 'restore'].includes(action) ||
      (action !== 'verify' && !destination)
    )
      throw new Error(
        'Использование: node server/companion-backup.mjs verify SOURCE | backup SOURCE NEW_COPY | restore COPY NEW_DATABASE',
      )
    if (action === 'verify') await verifyDatabase(resolve(source))
    else
      await (action === 'backup' ? backupDatabase : restoreDatabase)(
        resolve(source),
        resolve(destination),
      )
    process.stdout.write('Проверка SQLite завершена успешно.\n')
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Операция SQLite не выполнена.'}\n`,
    )
    process.exitCode = 1
  }
}
