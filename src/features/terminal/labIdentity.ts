import type { SkillId } from '../workshop/skills'

/** Legacy IDs represent the same cause as their expanded model; cosmetic copies are not new mastery. */
export function causeForLab(id: string, recorded?: string) {
  const value = recorded ?? id
  if (value === 'TERM-DNS-SERVER') return 'dns'
  if (value === 'TERM-DNS-CACHE') return 'client-cache'
  if (value === 'TERM-ICMP-TCP') return 'icmp-filter'
  return value
}

export function skillForLab(id: string, recorded?: SkillId): SkillId | undefined {
  if (id === 'TERM-ICMP-TCP') return 'transport'
  if (id === 'TERM-DNS-CACHE' || id === 'TERM-DNS-SERVER') return 'dns'
  return recorded
}
