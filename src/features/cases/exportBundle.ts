import type { LocalCase } from './schema'
import { CASE_BUNDLE_MAX_BYTES, CASE_BUNDLE_MAX_CASES } from './schema'

export function createCaseExports(cases: LocalCase[]) {
  const encoder = new TextEncoder()
  const header = '{\n  "schemaVersion": 1,\n  "cases": [\n'
  const footer = '\n  ]\n}'
  const envelopeBytes = encoder.encode(header + footer).length
  const groups: string[][] = []
  let group: string[] = []
  let groupBytes = envelopeBytes
  for (const item of cases) {
    // Serialize each case once; measuring a growing bundle on every iteration is quadratic.
    const serialized = JSON.stringify(item, null, 2).replace(/^/gm, '    ')
    const itemBytes = encoder.encode(serialized).length
    if (envelopeBytes + itemBytes > CASE_BUNDLE_MAX_BYTES)
      throw new Error('Один кейс слишком велик для JSON-импорта. Скачайте его отчёт отдельно.')
    if (
      group.length &&
      (group.length === CASE_BUNDLE_MAX_CASES || groupBytes + 2 + itemBytes > CASE_BUNDLE_MAX_BYTES)
    ) {
      groups.push(group)
      group = []
      groupBytes = envelopeBytes
    }
    groupBytes += itemBytes + (group.length ? 2 : 0)
    group.push(serialized)
  }
  if (group.length || !groups.length) groups.push(group)
  return groups.map((items, index) => ({
    name:
      groups.length === 1
        ? 'workbench-cases.json'
        : `workbench-cases-${index + 1}-of-${groups.length}.json`,
    text: items.length
      ? header + items.join(',\n') + footer
      : JSON.stringify({ schemaVersion: 1, cases: [] }, null, 2),
    count: items.length,
  }))
}
