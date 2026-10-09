import { describe, it, expect } from 'vitest'
import { symptoms, scopes, buildGuidePlan, exportGuidePlan } from './catalog'
import type { SymptomId, ScopeId } from './catalog'
import { knowledgeEntries } from '../knowledge/catalog'
import { scenarios } from '../simulator/scenarios'
import { playbooks } from '../playbooks/catalog'
import { quizCategories } from '../learning/questions'

describe('guided diagnostic plans', () => {
  it('keeps every supported answer path usable, sourced and linked to existing content', () => {
    for (const symptom of symptoms) {
      expect(scenarios.some((scenario) => scenario.id === symptom.scenario)).toBe(true)
      expect(playbooks.some((book) => book.id === symptom.playbook)).toBe(true)
      expect(quizCategories).toContain(symptom.topic)
      for (const scope of scopes)
        for (const [detail] of symptom.options) {
          const plan = buildGuidePlan(symptom.id, scope.id, detail)
          expect(plan.steps[0]?.id).toBe('context')
          expect(new Set(plan.steps.map((step) => step.id)).size).toBe(plan.steps.length)
          for (const step of plan.steps) {
            expect(step.why.length).toBeGreaterThan(10)
            expect(step.lookFor.length).toBeGreaterThan(10)
            if (step.command)
              expect(
                knowledgeEntries.some(
                  (entry) =>
                    entry.command === step.command && entry.source.url === step.source?.url,
                ),
              ).toBe(true)
          }
        }
    }
  })
  it('adapts to USB, general connectivity, missing error code and unknown scope', () => {
    expect(buildGuidePlan('printer', 'single', 'usb').steps.some((step) => step.kind)).toBe(false)
    expect(
      buildGuidePlan('printer', 'many', 'network').steps.some((step) => step.kind === 'ipconfig'),
    ).toBe(true)
    expect(
      buildGuidePlan('vpn', 'single', 'always').steps.some((step) => step.kind === 'route'),
    ).toBe(false)
    expect(buildGuidePlan('network', 'single', 'wifi').steps[1]?.title).toContain('Wi-Fi')
    expect(buildGuidePlan('update', 'unknown', 'missing').steps[1]?.id).toBe('error-code')
    expect(buildGuidePlan('site', 'unknown', 'unknown').steps[0]?.why).toContain('ещё неизвестен')
  })
  it('rejects unknown IDs and arbitrary details instead of generating commands', () => {
    expect(() => buildGuidePlan('missing' as SymptomId, 'single', 'unknown')).toThrow()
    expect(() => buildGuidePlan('site', 'all' as ScopeId, 'unknown')).toThrow()
    expect(() => buildGuidePlan('site', 'single', 'one; rm -rf')).toThrow()
  })
  it('exports only actual steps and distinguishes user marks from diagnostic results', () => {
    const plan = buildGuidePlan('site', 'single', 'one')
    const text = exportGuidePlan(plan, ['context', '<script>alert(1)</script>'])
    expect(text).toContain('- [x] Уточните')
    expect(text).toContain('- [ ]')
    expect(text).toContain('не являются результатом автоматической проверки')
    expect(text).not.toContain('<script>')
    expect(text).toContain('https://learn.microsoft.com/')
    expect(text).toContain('PowerShell')
  })
})
