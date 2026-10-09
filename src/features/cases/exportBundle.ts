import type { LocalCase } from './schema'
const limit = 2 * 1024 * 1024
export function createCaseExports(cases: LocalCase[]) {
  const encode = (items: LocalCase[]) => JSON.stringify({ schemaVersion: 1, cases: items }, null, 2)
  const bytes = (text: string) => new TextEncoder().encode(text).length
  const groups: LocalCase[][] = []
  let group: LocalCase[] = []
  for (const item of cases) {
    if (bytes(encode([item])) > limit)
      throw new Error('Один кейс слишком велик для JSON-импорта. Скачайте его отчёт отдельно.')
    if (group.length && bytes(encode([...group, item])) > limit) {
      groups.push(group)
      group = []
    }
    group.push(item)
  }
  if (group.length || !groups.length) groups.push(group)
  return groups.map((items, index) => ({
    name:
      groups.length === 1
        ? 'workbench-cases.json'
        : `workbench-cases-${index + 1}-of-${groups.length}.json`,
    text: encode(items),
    count: items.length,
  }))
}
