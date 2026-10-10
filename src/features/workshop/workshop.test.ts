import { describe, expect, it } from 'vitest'
import {
  emptyWorkshop,
  skillStatus,
  recommendSkill,
  parseWorkshopProgress,
  workshopProgressSchema,
  trackSkills,
  skills,
  standLessonIds,
} from './skills'
import { graphSchema, sampleGraph, startGraph, chooseGraph, parseGraph } from './graph'
import { trainingTraces, parseTrace } from './traces'
import { workshopCourses } from './courses'
import { extendedLabs } from '../terminal/labDefinitions'
import { reportMarkdown, reportSchema } from './portfolio'
describe('skills and learning fidelity', () => {
  it('separates guided completion from two independent variants', () => {
    const p = emptyWorkshop()
    const base = {
      id: 'TERM-DHCP',
      skill: 'addressing' as const,
      mode: 'guided' as const,
      score: 100,
      hints: 0,
      complete: true,
      at: new Date().toISOString(),
      seed: 0,
    }
    p.attempts = [base]
    expect(skillStatus(p, 'addressing').mastered).toBe(false)
    p.attempts.push({ ...base, mode: 'practice' })
    expect(skillStatus(p, 'addressing').mastered).toBe(false)
    p.attempts.push({ ...base, mode: 'exam', seed: 1 })
    expect(skillStatus(p, 'addressing').mastered).toBe(true)
  })
  it('does not count repeated identical variants and recommends delayed review', () => {
    const p = emptyWorkshop(),
      at = new Date(0).toISOString()
    p.attempts = [
      {
        id: 'TERM-DHCP',
        skill: 'addressing',
        mode: 'practice',
        score: 100,
        hints: 0,
        complete: true,
        at,
        seed: 0,
      },
    ]
    p.attempts.push({ ...p.attempts[0]! })
    expect(skillStatus(p, 'addressing', 8 * 86400000).mastered).toBe(false)
    expect(recommendSkill(p, 8 * 86400000).skill.id).toBe('addressing')
  })
  it('rejects excessive counters, unknown fields and oversized imports', () => {
    expect(parseWorkshopProgress(JSON.stringify(emptyWorkshop()))).toEqual(emptyWorkshop())
    expect(
      workshopProgressSchema.safeParse({ ...emptyWorkshop(), commandHistory: ['PRIVATE'] }).success,
    ).toBe(false)
    expect(() => parseWorkshopProgress(' '.repeat(262145))).toThrow()
  })
  it('all courses have valid answer choices and working laboratory links', () => {
    for (const course of workshopCourses) {
      expect(course.options[course.correct]).toBeTruthy()
      expect(new URL(course.source).protocol).toBe('https:')
      for (const id of course.labs)
        expect(
          id.startsWith('TERM-') &&
            (['TERM-ICMP-TCP', 'TERM-DNS-CACHE'].includes(id) ||
              extendedLabs.some((l) => l.id === id)),
        ).toBe(true)
    }
  })
})
describe('branching incidents', () => {
  it('allows a reachable loop with an exit and grades useful actions', () => {
    expect(graphSchema.safeParse(sampleGraph).success).toBe(true)
    let a = startGraph(sampleGraph)
    a = chooseGraph(sampleGraph, a, 1)
    a = chooseGraph(sampleGraph, a, 0)
    a = chooseGraph(sampleGraph, a, 0)
    expect(a.finished).toBe(true)
    expect(a.score).toBe(67)
    expect(() => chooseGraph(sampleGraph, a, 0)).toThrow()
  })
  it('rejects unreachable nodes and loops without any terminating path', () => {
    const invalid = {
      ...sampleGraph,
      nodes: sampleGraph.nodes.map((n) => ({
        ...n,
        choices: n.choices.map((c) => ({ ...c, to: 'request' })),
      })),
    }
    expect(() => parseGraph(JSON.stringify(invalid))).toThrow()
    expect(() => parseGraph(JSON.stringify({ ...sampleGraph, start: 'missing' }))).toThrow()
    expect(() => parseGraph(' '.repeat(131073))).toThrow()
  })
  it('bounds attempts even in valid cyclic graphs', () => {
    let a = startGraph(sampleGraph)
    for (let i = 0; i < 40; i++) a = chooseGraph(sampleGraph, a, 1)
    expect(a.finished).toBe(true)
    expect(a.steps).toHaveLength(40)
  })
})
describe('trace and portfolio boundaries', () => {
  it.each(trainingTraces)('validates $title and rejects unsorted events', (trace) => {
    expect(parseTrace(JSON.stringify(trace))).toEqual(trace)
    expect(() =>
      parseTrace(JSON.stringify({ ...trace, events: [...trace.events].reverse() })),
    ).toThrow()
  })
  it('reports contain explicit notes and never automatically copy commands', () => {
    const value = {
      id: '00000000-0000-4000-8000-000000000002',
      title: 'Учебный отчёт',
      at: new Date().toISOString(),
      labId: 'TERM-DHCP',
      symptom: 'Нет адреса',
      hypothesis: 'DHCP',
      evidence: 'APIPA',
      change: 'Получена аренда',
      verification: 'Портал работает',
      score: 100,
    }
    expect(reportMarkdown(value)).toContain('Повторная проверка')
    expect(reportSchema.safeParse({ ...value, commands: ['SECRET'] }).success).toBe(false)
  })
})

it('routes repeat recommendations to the selected learning track and deduplicates actual variants', () => {
  const p = emptyWorkshop()
  p.track = 'network'
  p.attempts = [
    {
      id: 'TERM-SMB',
      skill: 'identity',
      mode: 'exam',
      score: 0,
      hints: 0,
      complete: false,
      at: new Date().toISOString(),
      seed: 0,
    },
  ]
  expect(recommendSkill(p).skill.id).toBe('addressing')
  const a = {
    id: 'TERM-DHCP',
    skill: 'addressing' as const,
    mode: 'exam' as const,
    score: 100,
    hints: 0,
    complete: true,
    at: new Date().toISOString(),
    seed: 1,
    variantKey: '192.0.2.11/24',
  }
  p.attempts = [a, { ...a, seed: 181 }]
  expect(skillStatus(p, 'addressing').mastered).toBe(false)
})

it('built-in branching investigations terminate and explain each decision', async () => {
  const { incidentPresets, graphDebrief } = await import('./incidentPresets')
  for (const preset of incidentPresets) {
    const g = graphSchema.parse(preset.graph)
    let a = startGraph(g)
    while (!a.finished) {
      const node = g.nodes.find((n) => n.id === a.node)!
      a = chooseGraph(
        g,
        a,
        node.choices.findIndex((c) => c.useful),
      )
    }
    expect(a.score).toBe(100)
    expect(a.steps.length).toBeGreaterThanOrEqual(2)
    expect(graphDebrief(g, a.steps, a.score)).toContain('Обосновано')
  }
})

describe('complete learning paths', () => {
  it('every track includes all prerequisites and a built-in material for each skill', () => {
    for (const [track, ids] of Object.entries(trackSkills)) {
      for (const id of ids) {
        const skill = skills.find((s) => s.id === id)!
        expect(skill.requires.every((required) => ids.includes(required))).toBe(true)
        expect(workshopCourses.some((c) => c.skill === id && c.tracks.includes(track))).toBe(true)
      }
    }
    for (const [id, lesson] of Object.entries(standLessonIds))
      expect(workshopCourses.some((c) => c.id === lesson && c.skill === id)).toBe(true)
  })
  it('theory plus self-check for topics without a command model moves forward without claiming mastery', () => {
    const p = emptyWorkshop()
    p.track = 'L2'
    const at = new Date().toISOString()
    for (const id of trackSkills.L2) {
      p.assessment[id] = true
      const lesson = standLessonIds[id]
      if (lesson) p.read.push(`LESSON-${lesson}`)
      else
        for (const seed of [0, 1])
          p.attempts.push({
            id: `TERM-${id.toUpperCase()}`,
            skill: id,
            mode: 'practice',
            score: 100,
            hints: 0,
            complete: true,
            at,
            seed,
          })
    }
    expect(skillStatus(p, 'services')).toMatchObject({ readyForStand: true, mastered: false })
    expect(recommendSkill(p).stand).toBe(true)
    p.read = p.read.filter((id) => id !== 'LESSON-RECOVERY')
    expect(recommendSkill(p).skill.id).toBe('recovery')
    expect(recommendSkill(p).stand).not.toBe(true)
  })
})
