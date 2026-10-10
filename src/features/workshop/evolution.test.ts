import { describe, expect, it } from 'vitest'
import { emptyProgress } from '../learning/progress'
import { emptyWorkshop } from './skills'
import { backupSchema, parseBackup } from './backup'
import { extendedLabs } from '../terminal/labDefinitions'
import {
  createNetwork,
  networkStateSchema,
  topologySchema,
  assessNetwork,
} from '../terminal/networkModel'
import { executeNetwork } from '../terminal/networkEngine'
import { fleetMatrix } from '../terminal/fleet'
import { reviewCommand } from '../terminal/review'
import { workshopCourses } from './courses'
import { standAttemptSchema, standMarkdown } from './stand'
const empty = () => ({
  format: 'it-workbench-learning-backup',
  schemaVersion: 1,
  createdAt: '2026-10-10T00:00:00Z',
  learning: emptyProgress(),
  workshop: emptyWorkshop(),
  labs: [],
  courses: [],
  graphs: [],
  portfolio: [],
  standAttempts: [],
})
describe('complete learning backup boundaries', () => {
  it('round-trips both journals and rejects raw data, oversized input and incomplete packages', () => {
    expect(parseBackup(JSON.stringify(empty())).learning.schemaVersion).toBe(3)
    expect(() => parseBackup(JSON.stringify({ ...empty(), raw: 'PRIVATE' }))).toThrow()
    expect(() => parseBackup(' '.repeat(16 * 1024 * 1024 + 1))).toThrow('16 MiB')
    expect(backupSchema.safeParse({ ...empty(), portfolio: undefined }).success).toBe(false)
  })
  it('validates course references against labs in the same package and blocks duplicates', () => {
    const lab = { ...extendedLabs[0]!, id: 'USR-00000000-0000-4000-8000-000000000005' },
      course = {
        ...workshopCourses[0],
        id: 'COURSE-' + 'A'.repeat(32),
        schemaVersion: 1,
        labs: [lab.id],
      }
    expect(backupSchema.safeParse({ ...empty(), labs: [lab], courses: [course] }).success).toBe(
      true,
    )
    expect(backupSchema.safeParse({ ...empty(), courses: [course] }).success).toBe(false)
    expect(backupSchema.safeParse({ ...empty(), labs: [lab, lab] }).success).toBe(false)
    expect(backupSchema.safeParse({ ...empty(), labs: [extendedLabs[0]] }).success).toBe(false)
  })
})
describe('multiple client and server isolation', () => {
  const definition = extendedLabs.find((l) => l.id === 'TERM-FLEET')!
  it('distinguishes client-wide DNS failure from one-server outages and requires fresh verification of all pairs', () => {
    let s = createNetwork(definition)
    const initial = fleetMatrix(s)
    expect(initial).toHaveLength(6)
    expect(initial.filter((p) => p.source === 'pc-2').every((p) => !p.dns)).toBe(true)
    expect(initial.find((p) => p.source === 'client' && p.target === 'web-2')?.tcp).toBe(false)
    expect(initial.find((p) => p.source === 'client' && p.target === 'api')?.tcp).toBe(true)
    s = executeNetwork(s, ['lab', 'hosts']).state
    s = executeNetwork(s, ['lab', 'verify-fleet']).state
    for (const command of [
      'lab repair pc-2 dns',
      'lab repair web-2 service',
      'lab repair api http',
      'Restart-Service WebApp',
    ])
      s = executeNetwork(s, command.split(' ')).state
    expect(fleetMatrix(s).every((p) => p.https)).toBe(true)
    s = executeNetwork(s, ['curl', '-I', 'https://portal.lab.example']).state
    expect(assessNetwork(s, 0, 0).complete).toBe(false)
    s = executeNetwork(s, ['lab', 'verify-fleet']).state
    expect(assessNetwork(s, 0, 0).complete).toBe(true)
    s = executeNetwork(s, ['lab', 'repair', 'pc-2', 'dns']).state
    expect(s.verifiedRevision).toBeNull()
    expect(assessNetwork(s, 0, 0).complete).toBe(false)
    expect(networkStateSchema.safeParse(s).success).toBe(true)
  })
  it('rejects unknown or role-incompatible operations without changing model state', () => {
    const s = createNetwork(definition)
    for (const command of [
      'lab probe api web-2',
      'lab repair web-2 dns',
      'lab repair pc-2 http',
      'lab repair unknown service',
    ]) {
      const result = executeNetwork(s, command.split(' '))
      expect(result.ok).toBe(false)
      expect(result.state).toEqual(s)
    }
    const invalid = structuredClone(definition)
    invalid.additionalHosts![0]!.address = invalid.gateway
    expect(topologySchema.safeParse(invalid).success).toBe(false)
  })
  it('keeps real-looking DNS, TCP and HTTP forms consistent for additional servers', () => {
    let s = createNetwork(definition)
    expect(executeNetwork(s, ['curl', '-I', 'https://api.lab.example']).output).toContain('503')
    s = executeNetwork(s, ['lab', 'repair', 'api', 'http']).state
    expect(executeNetwork(s, ['curl', '-I', 'https://api.lab.example']).output).toContain('200 OK')
    expect(
      executeNetwork(s, ['Test-NetConnection', 'api.lab.example', '-Port', '443']).output,
    ).toContain('"TcpTestSucceeded": true')
  })
})
it('explains a regression, suggests a related lesson and never changes scoring', () => {
  const before = createNetwork(extendedLabs.find((l) => l.id === 'TERM-HTTP')!)
  const result = executeNetwork(before, [
    'Set-DnsClientServerAddress',
    '-InterfaceIndex',
    '12',
    '-ServerAddresses',
    '192.0.2.54',
  ])
  const score = assessNetwork(result.state, undefined, 0)
  expect(reviewCommand(before, result.state, true)).toMatchObject({
    title: 'Изменение добавило неисправность',
    lesson: 'DNS',
  })
  expect(assessNetwork(result.state, undefined, 0)).toEqual(score)
  expect(reviewCommand(before, before, true)).toBeUndefined()
  expect(reviewCommand(before, before, false)?.title).toBe('Команда не выполнена')
})
it('exports a self-reported stand result without inventing a score or retaining captures', () => {
  const report = {
    id: '00000000-0000-4000-8000-000000000008',
    taskId: 'dns',
    at: '2026-10-10T00:00:00Z',
    platform: 'Windows 11 RU',
    completedSteps: [0, 1, 2, 3],
    symptom: 'Имя не разрешалось',
    hypothesis: 'Неверный DNS',
    change: 'Исправлен DNS',
    verification: 'Проверен целевой сервис',
    answer: 'Прямой запрос не меняет настройки адаптера.',
  }
  expect(standMarkdown(standAttemptSchema.parse(report))).toContain(
    'приложение не удостоверяет выполнение',
  )
  expect(standAttemptSchema.safeParse({ ...report, raw: 'PRIVATE', score: 100 }).success).toBe(
    false,
  )
})
