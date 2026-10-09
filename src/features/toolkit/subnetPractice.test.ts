import { describe, it, expect } from 'vitest'
import { getSubnetExercise, checkSubnetAnswer } from './subnetPractice'
describe('subnet exercises', () => {
  it.each([
    ['network-25', '192.0.2.128'],
    ['broadcast-26', '198.51.100.127'],
    ['hosts-30', '2'],
    ['mask-24', '255.255.255.0'],
    ['network-28', '198.51.100.48'],
    ['hosts-31', '2'],
    ['hosts-32', '1'],
    ['broadcast-29', '192.0.2.103'],
  ])('grades %s with an explanation', (id, answer) => {
    expect(checkSubnetAnswer(id, ` ${answer} `)).toMatchObject({ valid: true, correct: true })
    expect(checkSubnetAnswer(id, answer).message).toContain(answer)
    expect(checkSubnetAnswer(id, id.startsWith('hosts') ? '99' : '1.2.3.4')).toMatchObject({
      valid: true,
      correct: false,
    })
  })
  it.each(['', '-1', '1.5', '1e2', '2 адреса', '<script>', '0002'])(
    'rejects malformed host count %j without grading',
    (answer) => {
      expect(checkSubnetAnswer('hosts-30', answer)).toMatchObject({ valid: false, correct: false })
    },
  )
  it.each(['', '999.1.1.1', '192.0.2', '192.0.2.128/25', 'a.b.c.d'])(
    'rejects malformed addresses %j',
    (answer) => {
      expect(checkSubnetAnswer('network-25', answer).valid).toBe(false)
    },
  )
  it('explains /31 and /32 edge cases and rejects unknown tasks', () => {
    expect(getSubnetExercise('hosts-31').explanation).toContain('RFC 3021')
    expect(getSubnetExercise('hosts-32').explanation).toContain('один адрес')
    expect(() => getSubnetExercise('arbitrary')).toThrow()
  })
})
