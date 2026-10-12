import { describe, expect, it } from 'vitest'
import {
  emptyWorkshop,
  modelStandLessons,
  recommendSkill,
  skillStatus,
  skillIds,
  type SkillId,
} from '../domain/skills'
import { todayTask } from '../application/learningFlow'
import { extendedLabs } from '../../terminal/labDefinitions'
import { terminalLabs } from '../../terminal/catalog'
import { workshopCourses } from '../domain/courses'
import { packageChecks, packageForSkill } from '../domain/packages'
import { allLearningQuestions } from '../../learning/catalog'
import { academyCourses } from '../../academy/catalog'
import { practiceTasks } from '../../practice/catalog'
import { scenarios } from '../../simulator/scenarios'
import { taskSkill, taskSkills } from '../application/competencies'
import { measureStorageTables } from '../../../infrastructure/learning-storage/database'
import {
  actProfessional,
  startProfessional,
  finishProfessional,
  professionalAttemptSchema,
  hypothesisEvidence,
  professionalMarkdown,
  type ProfessionalAttempt,
} from '../domain/professional/index'
import { backupSchema, parseBackup } from '../application/backup'
import { emptyProgress } from '../../learning/progress'
const now = Date.parse('2026-10-11T10:00:00Z'),
  at = new Date(now).toISOString()
const reason = 'Проверяю причину отказа по независимым наблюдениям.'
function run(a: ProfessionalAttempt, action: string, refs: number[] = []) {
  return actProfessional(a, action, reason, refs)
}
function completeUnknown(seed: number, bruteForce = false) {
  let a = startProfessional('unknown', 0, seed)
  if (bruteForce) a = run(a, 'repair:cache')
  for (const action of ['clarify', 'scope', 'dns', 'path', 'http', 'journal']) a = run(a, action)
  const fault = a.remaining[0]!,
    step =
      a.steps.findIndex((s) => s.findings.some((f) => f.fault === fault && f.present === true)) + 1
  a.hypotheses.push({
    id: crypto.randomUUID(),
    fault,
    explanation: reason,
    step,
    conclusion: 'confirmed',
    nextStep: 'Минимальное изменение с повторной проверкой.',
  })
  a = run(
    a,
    `repair:${fault}`,
    a.steps.map((_, i) => i + 1),
  )
  a = run(a, 'verify')
  a.hypothesisFaults = [fault]
  a.evidenceRefs = a.steps.map((_, i) => i + 1)
  a.report = {
    symptom: 'Клиент не может открыть учебный портал по имени.',
    hypothesis: 'Причина подтверждена сравнением исходных наблюдений и независимых проверок.',
    evidence: 'Номера проверок и результаты сопоставлены в таблице гипотез.',
    change: 'Применено минимальное изменение по подтверждённой причине; откат предусмотрен.',
    verification: 'После изменения успешно выполнен запрос пользователя в новой ревизии.',
  }
  return a
}
describe('audit remediation', () => {
  it('every existing question, practice task, academy lab and scenario has an explicit skill decision', () => {
    const ids = [
      ...allLearningQuestions.map((q) => q.id),
      ...practiceTasks.map((t) => `PRACTICE-${t.id}`),
      ...academyCourses.map((c) => `LAB-${c.id}`),
      ...scenarios.map((s) => s.id),
    ]
    expect(ids.filter((id) => !taskSkills.has(id))).toEqual([])
    expect(taskSkill('PRACTICE-capacity')).toBe('addressing')
    expect(taskSkill('PRACTICE-packet-loss')).toBe('transport')
    expect(taskSkill('new-unregistered-task')).toBeUndefined()
  })
  it.each(Object.entries(modelStandLessons))(
    '%s can continue beyond its sole modeled cause without claiming mastery',
    (id, lesson) => {
      const skill = id as SkillId,
        p = emptyWorkshop(),
        lab = extendedLabs.find((l) => l.skill === skill)!
      p.track = skill === 'linux' ? 'linux' : skill === 'windows' ? 'windows' : 'network'
      for (const s of skillIds) p.assessment[s] = true
      p.read = workshopCourses.map((c) => `LESSON-${c.id}`)
      p.attempts = terminalLabs.map((l) => ({
        id: l.id,
        skill: 'skill' in l ? l.skill! : l.id === 'TERM-ICMP-TCP' ? 'transport' : 'dns',
        mode: 'exam',
        score: 100,
        hints: 0,
        complete: true,
        at,
        seed: 0,
        causeFamily: 'fault' in l ? l.fault : l.id,
        competencies: ['diagnosis', 'verification'],
      }))
      p.theoryChecks = skillIds.flatMap((id) =>
        packageChecks(packageForSkill(id).id)
          .filter((c) => c.skill === id)
          .map((c) => ({ taskId: c.id, skill: id, form: c.form, correct: true, at })),
      )
      // All existing content is passed in the actual affected learning track.
      expect(p.read).toContain(`LESSON-${lesson}`)
      expect(lab).toBeDefined()
      expect(skillStatus(p, skill, now)).toMatchObject({
        modelComplete: true,
        readyForStand: true,
        readyToAdvance: false,
        mastered: false,
      })
      const stripped = { ...p, attempts: p.attempts.filter((a) => a.skill !== skill) }
      expect(skillStatus(stripped, skill, now).modelComplete).toBe(false)
      expect(recommendSkill(stripped, now).skill.id).toBe(skill)
      expect(recommendSkill(p, now).stand).toBe(true)
      expect(todayTask(p, now).url).toContain('workshop=stand')
    },
  )
  it('counts storage bytes exactly for UTF-8, escaping, empty tables and early overflow', async () => {
    const rows = [[], [{ id: 'я', note: 'a"b\n', value: null }], [{ values: [1, 2] }, { id: '😀' }]]
    let reads = 0
    const tables = rows.map((values) => ({
      each: async (visit: (value: unknown) => void) => {
        for (const value of values) {
          reads++
          visit(value)
        }
      },
    }))
    const expected = new TextEncoder().encode(JSON.stringify(rows)).length
    expect(await measureStorageTables(tables, expected)).toBe(expected)
    reads = 0
    await expect(measureStorageTables(tables, 10)).rejects.toThrow('12 MiB')
    expect(reads).toBe(1)
  })
})
describe('unknown-cause investigation', () => {
  it.each([0, 1, 2, 3])(
    'seed %s yields a completable diagnosis and survives backup/import',
    (seed) => {
      const a = completeUnknown(seed),
        completed = finishProfessional(a)
      expect(completed.score).toBe(100)
      expect(professionalAttemptSchema.parse(JSON.parse(JSON.stringify(completed)))).toEqual(
        completed,
      )
      const backup = backupSchema.parse({
        format: 'it-workbench-learning-backup',
        schemaVersion: 2,
        createdAt: at,
        learning: emptyProgress(),
        workshop: emptyWorkshop(),
        labs: [],
        courses: [],
        graphs: [],
        portfolio: [],
        standAttempts: [],
        scenarios: [],
        drafts: [],
        professionalAttempts: [completed],
      })
      expect(parseBackup(JSON.stringify(backup)).professionalAttempts?.[0]).toEqual(completed)
      expect(startProfessional('unknown', 2, seed).remaining).toEqual(
        startProfessional('unknown', 0, seed).remaining,
      )
      expect(professionalMarkdown(startProfessional('unknown', 0, seed))).toContain(
        'причина и вариант скрыты',
      )
    },
  )
  it('rejects unsupported changes and contradictory conclusions; guessing loses score', () => {
    const a = completeUnknown(0, true)
    expect(finishProfessional(a).score).toBe(90)
    a.hypotheses[0]!.conclusion = 'refuted'
    expect(() => finishProfessional(a)).toThrow()
    expect(run(startProfessional('unknown', 0, 0), 'repair:cache').revision).toBe(0)
  })
  it('marks historical evidence, invalidates verification after rollback and rejects dangling links', () => {
    let a = completeUnknown(3)
    expect(hypothesisEvidence(a, a.hypotheses[0]!).stale).toBe(true)
    expect(hypothesisEvidence(a, a.hypotheses[0]!).matches).toBe(true)
    a = run(a, 'rollback')
    expect(a.verifiedRevision).toBeNull()
    expect(() => finishProfessional(a)).toThrow()
    a.hypotheses[0]!.step = 60
    expect(professionalAttemptSchema.safeParse(a).success).toBe(false)
  })
  it('reads legacy attempts without hypothesis rows, seed or structured findings', () => {
    const a = run(startProfessional('portal'), 'dns')
    const old = JSON.parse(JSON.stringify(a))
    delete old.seed
    delete old.hypotheses
    delete old.steps[0].findings
    expect(professionalAttemptSchema.parse(old)).toMatchObject({
      seed: null,
      hypotheses: [],
      steps: [{ findings: [] }],
    })
  })
})
