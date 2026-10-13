import { describe, expect, it } from 'vitest'
import { graphSchema, sampleGraph, startGraph, chooseGraph, abandonGraph } from '../domain/graph'
import { emptyWorkshop, skillStatus } from '../domain/skills'
import { reportSchema } from '../domain/portfolio'
import { loadCollection } from '../../../shared/persistence/collectionLoader'
import { parseBackup, backupLimit } from '../application/backup'
import { emptyProgress } from '../../learning/progress'
import { workshopCourses } from '../domain/courses'
import { supportedCommands, commandHelp } from '../../terminal/commandRegistry'
import { createNetwork } from '../../terminal/networkModel'
import { extendedLabs } from '../../terminal/labDefinitions'
import { executeNetwork } from '../../terminal/networkEngine'
import {
  startProfessional,
  actProfessional,
  finishProfessional,
  canCompleteProfessional,
  professionalAttemptSchema,
  professionalCases,
} from '../domain/professional/index'
describe('audit consequences', () => {
  it('does not count a useful loop or the safety limit as successful completion', () => {
    const graph = graphSchema.parse({
      ...sampleGraph,
      nodes: sampleGraph.nodes.map((n, i) =>
        i === 0
          ? { ...n, choices: n.choices.map((c, j) => (j === 1 ? { ...c, useful: true } : c)) }
          : n,
      ),
    })
    let a = startGraph(graph)
    for (let i = 0; i < 40; i++) a = chooseGraph(graph, a, 1)
    expect(a.status).toBe('limit-reached')
    expect(a.node).toBe('request')
    expect(a.score).toBeLessThan(100)
    const completed = chooseGraph(
      sampleGraph,
      chooseGraph(sampleGraph, startGraph(sampleGraph), 0),
      0,
    )
    expect(completed).toMatchObject({ status: 'completed', score: 100 })
    expect(abandonGraph(startGraph(graph)).status).toBe('abandoned')
  })
  it('keeps old and cosmetic attempts below mastery; theory and a delayed new cause remain separate', () => {
    const p = emptyWorkshop(),
      a = {
        id: 'TERM-DHCP',
        skill: 'addressing' as const,
        mode: 'practice' as const,
        score: 100,
        hints: 0,
        complete: true,
        at: '2026-10-01T00:00:00Z',
        seed: 0,
        causeFamily: 'dhcp',
        competencies: ['config', 'verification'],
      }
    p.attempts = [a, { ...a, seed: 1, variantKey: 'other-address', at: '2026-10-09T00:00:00Z' }]
    expect(skillStatus(p, 'addressing').mastered).toBe(false)
    p.attempts.push({ ...a, causeFamily: 'mask', at: '2026-10-10T00:00:00Z' })
    expect(skillStatus(p, 'addressing').mastered).toBe(false)
    p.theoryChecks = ['choice', 'calculation'].map((form) => ({
      taskId: form,
      skill: 'addressing',
      form: form as 'choice' | 'calculation',
      correct: true,
      at: a.at,
    }))
    expect(skillStatus(p, 'addressing').mastered).toBe(true)
  })
  it('reaching END without proving all goals cannot award a successful investigation', () => {
    const graph = graphSchema.parse({
      ...sampleGraph,
      nodes: sampleGraph.nodes.map((n, i) =>
        i === 0
          ? {
              ...n,
              choices: [
                ...n.choices,
                {
                  label: 'Перейти сразу к завершению',
                  to: 'END',
                  useful: true,
                  explanation: 'Этот переход не подтверждает требуемые учебные цели.',
                },
              ],
            }
          : n,
      ),
    })
    const a = chooseGraph(graph, startGraph(graph), 2)
    expect(a).toMatchObject({ status: 'completed', goalsMet: false, proofs: [], score: 0 })
  })
  it('isolates broken records, preserves their raw data, and refuses a completed empty report', () => {
    const draft = {
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Учебный отчёт',
      at: '2026-10-10T00:00:00Z',
      labId: 'TERM-DHCP',
      symptom: '',
      hypothesis: '',
      evidence: '',
      change: '',
      verification: '',
      score: 100,
    }
    expect(reportSchema.parse(draft).status).toBe('draft')
    expect(reportSchema.safeParse({ ...draft, status: 'completed' }).success).toBe(false)
    const loaded = loadCollection('reports', [draft, { ...draft, id: 'broken' }], reportSchema)
    expect(loaded.valid).toHaveLength(1)
    expect(loaded.problems[0]?.raw).toEqual({ ...draft, id: 'broken' })
  })
  it('round-trips the formerly unexportable collection of twenty maximum courses, bounded in UTF-8', () => {
    const courses = Array.from({ length: 20 }, (_, i) => ({
      ...workshopCourses[0],
      schemaVersion: 1,
      id: 'COURSE-' + i.toString(16).toUpperCase().padStart(32, '0'),
      paragraphs: Array.from({ length: 12 }, () => 'я'.repeat(4000)),
      steps: Array.from({ length: 10 }, () => 'я'.repeat(1000)),
      why: 'я'.repeat(2000),
      question: 'я'.repeat(500),
      options: ['а'.repeat(500), 'б'.repeat(500)],
      correct: 0,
    }))
    const text = JSON.stringify({
      format: 'it-workbench-learning-backup',
      schemaVersion: 2,
      createdAt: '2026-10-10T00:00:00Z',
      learning: emptyProgress(),
      workshop: emptyWorkshop(),
      labs: [],
      courses,
      graphs: [],
      portfolio: [],
      standAttempts: [],
      scenarios: [],
      drafts: [],
      professionalAttempts: [],
    })
    expect(new TextEncoder().encode(text).length).toBeGreaterThan(2 * 1024 * 1024)
    expect(parseBackup(text).courses).toHaveLength(20)
    expect(() => parseBackup(' '.repeat(backupLimit + 1))).toThrow('16 MiB')
  })
  it('every advertised network form executes and appears in the same help/completion registry', () => {
    for (const lab of [extendedLabs[0]!, extendedLabs.find((l) => l.id === 'TERM-FLEET')!]) {
      const state = createNetwork(lab)
      for (const command of supportedCommands(state)) {
        expect(commandHelp(state)).toContain(command.example)
        expect(executeNetwork(state, command.example.split(' ')).ok, command.example).toBe(true)
      }
    }
  })
})
describe('professional incident goals', () => {
  const reason = 'Проверяю гипотезу по подготовленным данным.'
  const act = (a: ReturnType<typeof startProfessional>, action: string) =>
    actProfessional(
      a,
      action,
      reason,
      a.steps.slice(0, 10).map((_, i) => i + 1),
    )
  const report = (a: ReturnType<typeof startProfessional>) => {
    a.report = {
      symptom: 'Пользователи учебных сегментов не могли выполнить операцию приложения.',
      hypothesis: 'Сопоставлены независимые причины клиента и зависимостей сервера.',
      evidence: 'Выбраны проверки масштаба, изменения и последующей операции пользователя.',
      change: 'Применены минимальные исправления по подтверждённым проверкам; возможен rollback.',
      verification: 'Повторная операция после последней ревизии подтверждает результат модели.',
    }
    a.hypothesisFaults = [...a.repaired, ...(a.escalated ? ['permissions' as const] : [])]
    a.evidenceRefs = a.steps.map((_, i) => i + 1)
  }
  it('a single repair cannot finish a multiple-cause incident; verification is invalidated by rollback', () => {
    let a = startProfessional('portal')
    for (const command of ['clarify', 'scope', 'dns', 'repair:cache', 'verify']) a = act(a, command)
    expect(a.remaining).toContain('service')
    expect(canCompleteProfessional(a)).toBe(false)
    expect(() => finishProfessional(a)).toThrow()
    a = act(a, 'journal')
    a = act(a, 'repair:service')
    a = act(a, 'verify')
    report(a)
    expect(finishProfessional(a).status).toBe('completed')
    a = act(a, 'rollback')
    expect(a.verifiedRevision).toBeNull()
  })
  it('all variants have complete evidence-based paths; recovery needs RTO/RPO and SMB explicit escalation', () => {
    for (const c of professionalCases)
      for (let variant = 0; variant < c.faults.length; variant++) {
        let a = startProfessional(c.id, variant, variant)
        for (const action of [
          'clarify',
          'scope',
          'dns',
          'path',
          'tcp',
          'http',
          'journal',
          'permissions',
          'backup',
          'content',
        ])
          a = act(a, action)
        a.selectedSnapshot = '10:02'
        if (c.id === 'unknown') {
          const fault = a.remaining[0]!
          const step =
            a.steps.findIndex((s) => s.findings.some((f) => f.fault === fault && f.present)) + 1
          a.hypotheses.push({
            id: crypto.randomUUID(),
            fault,
            explanation: reason,
            step,
            conclusion: 'confirmed',
            nextStep: 'Минимальное изменение и повторная проверка.',
          })
        }
        for (const fault of [...a.remaining])
          a = act(a, fault === 'permissions' ? 'escalate' : `repair:${fault}`)
        if (c.id === 'recovery') a = act(a, 'content')
        a = act(a, 'verify')
        report(a)
        expect(professionalAttemptSchema.safeParse(finishProfessional(a)).success).toBe(true)
        if (c.id === 'recovery') {
          a.lossMinutes = 6
          expect(() => finishProfessional(a)).toThrow()
        }
      }
  })
})
