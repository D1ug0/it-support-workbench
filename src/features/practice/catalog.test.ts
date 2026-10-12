import { describe, it, expect } from 'vitest'
import { practiceTasks, checkPractice } from './catalog'
describe('independent practice', () => {
  it('contains the 27 distinct tasks in the current curriculum', () => {
    expect(practiceTasks).toHaveLength(27)
    expect(new Set(practiceTasks.map((t) => t.id)).size).toBe(27)
  })
  it.each(practiceTasks)('validates $id without accepting an empty answer', (task) => {
    expect(checkPractice(task, task.expected[0]!)).toMatchObject({ valid: true, correct: true })
    expect(checkPractice(task, '')).toMatchObject({ valid: false, correct: false })
  })
  it('checks independent expected calculations and complete distinct step order', () => {
    const get = (id: string) => practiceTasks.find((t) => t.id === id)!
    expect(checkPractice(get('mtu-payload'), '1472').correct).toBe(true)
    expect(checkPractice(get('mtu-payload'), '1500')).toMatchObject({ valid: true, correct: false })
    expect(checkPractice(get('route-gateway'), '198.51.100.2').correct).toBe(true)
    expect(checkPractice(get('srv-target'), 'DC-B.LAB.EXAMPLE.').correct).toBe(true)
    expect(checkPractice(get('plan-tls'), '2 4 1 3').correct).toBe(true)
    expect(checkPractice(get('plan-tls'), '2,2,1,3').valid).toBe(false)
    expect(checkPractice(get('plan-tls'), '2,4,1').valid).toBe(false)
    expect(checkPractice(get('subnet-1'), '192.0.2.128').correct).toBe(true)
    expect(checkPractice(get('subnet-8'), '2').correct).toBe(true)
  })
})
