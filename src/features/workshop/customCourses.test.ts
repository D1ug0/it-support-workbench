import { describe, expect, it } from 'vitest'
import { customCourseSchema, parseCustomCourses, validateCourseLinks } from './customCourses'
import { workshopCourses } from './courses'
const course = { ...workshopCourses[0]!, schemaVersion: 1, id: `COURSE-${'A'.repeat(32)}` }
const pack = (value = course) => JSON.stringify({ schemaVersion: 1, courses: [value] })
describe('authored course packages', () => {
  it('round-trips a strict package independently from built-in course IDs', () => {
    expect(parseCustomCourses(pack())).toEqual([course])
    expect(() => customCourseSchema.parse({ ...course, id: 'ADDRESS' })).toThrow()
  })
  it.each([
    { schemaVersion: 99 },
    { correct: 3 },
    { options: ['same', 'same'] },
    { source: 'javascript:alert(1)' },
    { source: 'https://user:password@example.com' },
    { tracks: ['L1', 'L1'] },
    { labs: ['TERM-DHCP', 'TERM-DHCP'] },
    { paragraphs: [] },
    { command: 'PRIVATE' },
  ])('rejects malformed content before saving: %j', (patch) => {
    expect(() => parseCustomCourses(pack({ ...course, ...patch }))).toThrow()
  })
  it('rejects a duplicate, future-version or oversized package atomically', () => {
    expect(() =>
      parseCustomCourses(JSON.stringify({ schemaVersion: 1, courses: [course, course] })),
    ).toThrow()
    expect(() =>
      parseCustomCourses(JSON.stringify({ schemaVersion: 2, courses: [course] })),
    ).toThrow()
    expect(() => parseCustomCourses(' '.repeat(131073))).toThrow('128 KiB')
  })
  it('requires referenced labs to exist before save; empty references are allowed', () => {
    const c = customCourseSchema.parse(course)
    expect(() => validateCourseLinks([c], ['TERM-DHCP'])).toThrow('Сначала импортируйте')
    expect(() => validateCourseLinks([c], c.labs)).not.toThrow()
    expect(() => validateCourseLinks([{ ...c, labs: [] }], [])).not.toThrow()
  })
})
