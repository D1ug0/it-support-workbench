import { describe, expect, it } from 'vitest'
import { academyCourses, academyQuestions } from './catalog'
import { answerLab, createLabAttempt, exportLab, revealLabHint, summarizeLab } from './lab'
describe('advanced learning labs', () => {
  it('keeps course prerequisites acyclic and decisions distinct, sourced and complete', () => {
    expect(academyCourses).toHaveLength(8)
    expect(academyQuestions).toHaveLength(32)
    expect(new Set(academyQuestions.map((q) => q.id)).size).toBe(32)
    function visit(id: string, ancestors: string[] = []) {
      expect(ancestors).not.toContain(id)
      const course = academyCourses.find((c) => c.id === id)
      expect(course).toBeDefined()
      for (const prerequisite of course!.prerequisites) visit(prerequisite, [...ancestors, id])
    }
    for (const course of academyCourses) {
      visit(course.id)
      expect(course.concepts.length).toBeGreaterThanOrEqual(3)
      expect(course.lab.evidence.length).toBeGreaterThan(100)
      for (const q of course.lab.questions) {
        expect(q.choices[q.correct]).toBeTruthy()
        expect(new Set(q.choices).size).toBe(q.choices.length)
        expect(q.explanation.length).toBeGreaterThan(50)
        expect(q.source.url).toMatch(
          /^https:\/\/(learn.microsoft.com|curl.se|www.rfc-editor.org)\//,
        )
      }
    }
    expect(academyCourses.find((c) => c.id === 'smb')!.lab.evidence).toContain(
      '\\\\files.lab.example\\Reports',
    )
  })
  it.each(academyCourses)(
    'completes $id and exports every decision without accepting duplicate answers',
    (course) => {
      const initial = createLabAttempt(course)
      let attempt = initial
      for (const q of course.lab.questions) attempt = answerLab(course, attempt, q.id, q.correct)
      const result = summarizeLab(course, attempt)
      expect(result).toMatchObject({ score: 100, complete: true, correct: 4 })
      expect(initial.answers).toEqual({})
      const first = course.lab.questions[0]!
      expect(answerLab(course, attempt, first.id, (first.correct + 1) % first.choices.length)).toBe(
        attempt,
      )
      const report = exportLab(course, attempt)
      for (const q of course.lab.questions) expect(report).toContain(q.explanation)
      expect(report).toContain('4/4')
      expect(report).toContain('Данные синтетические')
    },
  )
  it('counts first decisions and unique hints, and rejects a mismatched course or option', () => {
    const course = academyCourses[0]!,
      q = course.lab.questions[0]!
    const initial = createLabAttempt(course)
    const hinted = revealLabHint(course, initial, q.id)
    expect(revealLabHint(course, hinted, q.id)).toBe(hinted)
    const wrong = answerLab(course, hinted, q.id, (q.correct + 1) % q.choices.length)
    expect(summarizeLab(course, wrong)).toMatchObject({
      correct: 0,
      answered: 1,
      hints: 1,
      complete: false,
    })
    expect(exportLab(course, wrong)).toContain('Не выбран')
    expect(() => answerLab(course, initial, 'unknown', 0)).toThrow()
    expect(() => answerLab(course, initial, q.id, 3.5)).toThrow()
    expect(() => answerLab(course, initial, q.id, -1)).toThrow()
    expect(() => answerLab(course, initial, q.id, q.choices.length)).toThrow()
    expect(() => revealLabHint(course, initial, 'unknown')).toThrow()
    expect(() => summarizeLab(academyCourses[1]!, initial)).toThrow()
    expect(() =>
      answerLab(academyCourses[1]!, initial, academyCourses[1]!.lab.questions[0]!.id, 0),
    ).toThrow()
  })
})
