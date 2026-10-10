import type { SkillId } from './skills'
import { allLearningQuestions } from '../learning/catalog'
import { practiceTasks } from '../practice/catalog'
import { scenarios } from '../simulator/scenarios'
export function taskSkill(id: string): SkillId | undefined {
  const question = allLearningQuestions.find((q) => q.id === id)
  const practice = practiceTasks.find((t) => `PRACTICE-${t.id}` === id)
  const incident = scenarios.find((s) => s.id === id)
  const text =
    `${id} ${question?.category ?? ''} ${practice?.topic ?? ''} ${practice?.course ?? ''} ${incident?.category ?? ''}`.toLowerCase()
  if (/tls|https/.test(text)) return 'tls'
  if (/dhcp|подсет|subnet|адрес/.test(text)) return 'addressing'
  if (/dns/.test(text)) return 'dns'
  if (/smb|gpo|active directory|adv-ad|lab-ad/.test(text)) return 'identity'
  if (/ipv6/.test(text)) return 'ipv6'
  if (/wifi|wi-fi/.test(text)) return 'wifi'
  if (/vpn|route|маршрут/.test(text)) return 'routing'
  if (/windows/.test(text)) return 'windows'
  if (/сеть|tcp|transport|icmp/.test(text)) return 'transport'
  return undefined
}
