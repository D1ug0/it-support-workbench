// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FindingCard from './FindingCard.vue'
import { analyzeOutput } from '../application/analyzeOutput'
import { examples } from '../../../fixtures'

describe('finding presentation', () => {
  it('links evidence and exposes limitations', async () => {
    const finding = analyzeOutput(examples[2]!.text).findings[0]!
    const wrapper = mount(FindingCard, { props: { finding } })
    await wrapper.find('.evidence-links button').trigger('click')
    expect(wrapper.emitted('evidence')?.[0]?.[0]).toEqual(finding.evidence[0]?.range)
    await wrapper.find('.finding-expand').trigger('click')
    expect(wrapper.text()).toContain(finding.whatItDoesNotProve)
    expect(wrapper.text()).toContain('Что проверить дальше')
  })
  it('renders untrusted adapter labels as text', () => {
    const wrapper = mount(FindingCard, {
      props: {
        finding: analyzeOutput(examples[0]!.text).findings[0]!,
        adapterLabel: '<img src=x onerror=alert(1)>',
      },
    })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('<img src=x')
  })
})
