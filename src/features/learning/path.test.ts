import { describe, it, expect } from 'vitest'
import { buildLearningPath } from './path'
import { emptyProgress, recordAnswer } from './progress'
import { questions, quizCategories } from './questions'
import { knowledgeEntries } from '../knowledge/catalog'
describe('learning recommendations', () => {
  it('starts with the first topic and covers all questions without changing progress', () => {
    const state = emptyProgress()
    const path = buildLearningPath(state)
    expect(path.recommended?.topic).toBe('Сеть')
    expect(path.modules.map((module) => module.topic)).toEqual(quizCategories)
    expect(path.modules.reduce((sum, module) => sum + module.total, 0)).toBe(30)
    for (const module of path.modules)
      expect(knowledgeEntries.some((entry) => entry.id === module.reading)).toBe(true)
    expect(state).toEqual(emptyProgress())
  })
  it('prioritizes mistakes over unopened topics, then moves forward after correction', () => {
    const dns = questions.find((question) => question.category === 'DNS')!
    let state = recordAnswer(emptyProgress(), dns.id, false)
    expect(buildLearningPath(state).recommended?.topic).toBe('DNS')
    expect(buildLearningPath(state).reason).toContain('ошибки')
    state = recordAnswer(state, dns.id, true)
    expect(buildLearningPath(state).recommended?.topic).toBe('Сеть')
    for (const question of questions.filter((question) => question.category === 'Сеть'))
      state = recordAnswer(state, question.id, true)
    expect(buildLearningPath(state).recommended?.topic).toBe('DNS')
    expect(buildLearningPath(state).modules[0]?.status).toBe('Повторение')
  })
  it('keeps practice available after all last answers are correct', () => {
    const state = questions.reduce(
      (state, question) => recordAnswer(state, question.id, true),
      emptyProgress(),
    )
    const path = buildLearningPath(state)
    expect(path.recommended).toBeUndefined()
    expect(path.reason).toContain('не оценка готовности')
    expect(
      path.modules.every(
        (module) => module.correct === module.total && module.practice.startsWith('/'),
      ),
    ).toBe(true)
  })
})
