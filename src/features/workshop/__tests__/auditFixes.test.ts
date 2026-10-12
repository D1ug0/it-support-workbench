import { describe, expect, it } from 'vitest'
import type { Table } from 'dexie'
import { emptyWorkshop, recommendSkill, skillStatus, skillIds } from '../domain/skills'
import { todayTask } from '../application/learningFlow'
import { packageChecks, packageFinals, packageForSkill } from '../domain/packages'
import { extendedLabs } from '../../terminal/labDefinitions'
import { standTasks } from '../domain/stand'
import { putVersioned } from '../infrastructure/versionedRecord'
import {
  actProfessional,
  startProfessional,
  finishProfessional,
  canCompleteProfessional,
  professionalAttemptSchema,
  type ProfessionalAttempt,
} from '../domain/professional/index'
const first = '2026-10-01T10:00:00Z',
  later = '2026-10-10T10:00:00Z',
  now = Date.parse(later)
function addressing() {
  const p = emptyWorkshop()
  // This scenario tests the network route; L1 now introduces DNS before routing.
  p.track = 'network'
  p.read = ['LESSON-ADDRESS']
  p.theoryChecks = ['choice', 'calculation'].map((form) => ({
    taskId: form === 'choice' ? 'ADDRESS' : form,
    skill: 'addressing',
    form: form as 'choice' | 'calculation',
    correct: true,
    at: first,
  }))
  p.attempts = ['dhcp', 'mask', 'conflict'].map((causeFamily, seed) => ({
    id: `TERM-${causeFamily.toUpperCase()}`,
    skill: 'addressing',
    mode: 'exam',
    score: 100,
    hints: 0,
    complete: true,
    at: first,
    causeFamily,
    competencies: ['config', 'verification'],
    seed,
  }))
  return p
}
const reason = 'Сопоставляю гипотезу с проверками учебного сервиса.'
function act(a: ProfessionalAttempt, action: string) {
  return actProfessional(
    a,
    action,
    reason,
    a.steps.slice(0, 10).map((_, i) => i + 1),
  )
}
function report(a: ProfessionalAttempt) {
  a.hypothesisFaults = [...a.repaired]
  a.evidenceRefs = a.steps.map((_, i) => i + 1)
  a.report = {
    symptom: 'Учебные пользователи не могут создать заявку в приложении.',
    hypothesis: 'Независимые причины установлены по журналу и состоянию хранилища.',
    evidence: 'Проверки исходного состояния и новой ревизии включены в выбранные ссылки.',
    change: 'Исправлены только подтверждённые причины; rollback сохраняет исходник.',
    verification: 'После последней правки проверены данные и операция пользователя.',
  }
  return a
}
function recovery(snapshot: '09:30' | '10:02' = '10:02') {
  let a = startProfessional('recovery')
  a.selectedSnapshot = snapshot
  for (const s of [
    'clarify',
    'scope',
    'backup',
    'content',
    'http',
    'journal',
    'repair:backup',
    'repair:dependency',
    'verify',
  ])
    a = act(a, s)
  return report(a)
}
describe('learning route and delayed review', () => {
  it('advances after independent foundations without waiting a week for mastery', () => {
    const p = addressing()
    const status = skillStatus(p, 'addressing', Date.parse(first))
    expect(status).toMatchObject({ readyToAdvance: true, mastered: false, retention: false })
    expect(recommendSkill(p, Date.parse(first)).skill.id).toBe('routing')
  })
  it('retention remains reachable after every cause was already attempted; unordered imports work', () => {
    const p = addressing()
    p.attempts.push(...p.attempts.map((a) => ({ ...a, at: later })))
    p.attempts.reverse()
    expect(skillStatus(p, 'addressing', now)).toMatchObject({ retention: true, mastered: true })
    expect(recommendSkill(p, now).skill.id).toBe('routing')
  })
  it('one repeated seed cannot establish retention; a second different delayed cause is scheduled', () => {
    const p = addressing()
    p.attempts.push({ ...p.attempts[0]!, at: later, seed: 8 })
    expect(skillStatus(p, 'addressing', now)).toMatchObject({ retention: false, needsReview: true })
    expect(todayTask(p, now).url).toContain('TERM-MASK')
    p.attempts.push({ ...p.attempts[1]!, at: later, seed: 3 })
    expect(skillStatus(p, 'addressing', now).retention).toBe(true)
  })
  it('one theory form is insufficient and points to the addressing package, not a generic tab', () => {
    const p = addressing()
    p.theoryChecks.splice(1)
    expect(todayTask(p, now).url).toContain('package=network&skill=addressing')
    expect(skillStatus(p, 'addressing', Date.parse(first) - 1).independent).toBe(0)
  })
})
describe('incident evidence and recovery clock', () => {
  it('rejects placeholders, pre-restore content and invented zero RTO/RPO', () => {
    expect(() => actProfessional(startProfessional('recovery'), 'clarify', 'aaaaaaaaaa')).toThrow()
    let a = recovery()
    expect(canCompleteProfessional(a)).toBe(false)
    a.recoveryMinutes = 0
    a.lossMinutes = 0
    expect(() => finishProfessional(a)).toThrow()
    a = act(a, 'content')
    a.lossMinutes = 3
    a = report(a)
    expect(finishProfessional(a).status).toBe('completed')
    a.elapsedMinutes = 0
    a.recoveryMinutes = 0
    expect(() => finishProfessional(a)).toThrow()
    a = act(a, 'verify')
    a = report(a)
    a.report.symptom = 'aaaaaaaaaaaaaaaaaaaa'
    expect(() => finishProfessional(a)).toThrow()
  })
  it('uses the restored snapshot rather than a changed selection; old copy violates RPO', () => {
    let a = recovery('09:30')
    a.selectedSnapshot = '10:02'
    a = report(act(a, 'content'))
    expect(a.lossMinutes).toBe(35)
    expect(() => finishProfessional(a)).toThrow()
  })
  it('requires correct hypotheses and cited current revision; rollback invalidates evidence', () => {
    let a = report(act(recovery(), 'content'))
    const completed = finishProfessional(a)
    expect(professionalAttemptSchema.safeParse(completed).success).toBe(true)
    a.hypothesisFaults = ['dns']
    expect(() => finishProfessional(a)).toThrow()
    a = report(a)
    a.evidenceRefs = [1, 2, 7]
    expect(() => finishProfessional(a)).toThrow()
    a = report(act(a, 'rollback'))
    expect(canCompleteProfessional(a)).toBe(false)
  })
  it('preserves a legacy completed record without claiming the new rubric was passed', () => {
    const legacy = { ...recovery(), status: 'completed', score: 100, gradingVersion: 0 }
    expect(professionalAttemptSchema.parse(legacy).gradingVersion).toBe(0)
    expect(professionalAttemptSchema.safeParse({ ...legacy, gradingVersion: 2 }).success).toBe(
      false,
    )
  })
})
describe('record concurrency', () => {
  it('rejects a stale tab, deletion and restore tokens without overwriting its neighbour', async () => {
    type Row = { id: string; storageToken: string | null; note: string }
    const data = new Map<string, Row>()
    const table = {
      get: async (id: string) => data.get(id),
      put: async (value: Row) => {
        data.set(value.id, value)
      },
    } as unknown as Table<Row, string>
    const initial = await putVersioned(table, { id: 'attempt', storageToken: null, note: '' })
    const firstTab = await putVersioned(table, { ...initial, note: 'first tab evidence' })
    await expect(putVersioned(table, { ...initial, note: 'stale note' })).rejects.toThrow(
      'другой вкладке',
    )
    expect(data.get('attempt')?.note).toBe('first tab evidence')
    data.delete('attempt')
    await expect(putVersioned(table, firstTab)).rejects.toThrow()
    data.set('attempt', { ...firstTab, storageToken: crypto.randomUUID() })
    await expect(putVersioned(table, firstTab)).rejects.toThrow()
  })
})
it('every skill has multiple domain theory forms and finals address the intended task', () => {
  for (const skill of skillIds) {
    const packet = packageForSkill(skill)
    const checks = packageChecks(packet.id).filter((c) => c.skill === skill)
    expect(new Set(checks.map((c) => c.form)).size, skill).toBeGreaterThanOrEqual(2)
    expect(checks.length, skill).toBeGreaterThanOrEqual(2)
  }
  for (const final of Object.values(packageFinals)) {
    const url = new URL(final.url, 'https://local.example')
    if (url.pathname === '/terminal')
      expect(extendedLabs.some((l) => l.id === url.searchParams.get('lab'))).toBe(true)
    if (url.searchParams.get('workshop') === 'stand')
      expect(standTasks.some((t) => t.id === url.searchParams.get('task'))).toBe(true)
  }
  expect(packageChecks('git').find((c) => c.id === 'calculation')?.answer).toBe(6)
  expect(packageChecks('windows').find((c) => c.id === 'calculation')?.answer).toBe(4)
})
