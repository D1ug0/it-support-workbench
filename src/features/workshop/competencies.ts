import type { SkillId } from './skills'
// IDs are content contracts. Titles, categories and course filters can change without
// silently reassigning a result to another skill. null deliberately means no skill credit.
export const taskSkills = new Map<string, SkillId | null>()
const basicGroups: readonly (SkillId | null)[] = [
  'transport',
  'dns',
  'addressing',
  'addressing',
  'windows',
  null,
]
basicGroups.forEach((skill, group) => {
  for (let question = 1; question <= 5; question++)
    taskSkills.set(`Q-${group + 1}-${question}`, skill)
})
taskSkills.set('Q-1-3', 'routing')
taskSkills.set('Q-4-5', 'routing')
taskSkills.set('Q-5-5', 'routing')
const academyBindings: Record<string, SkillId> = {
  TLS: 'tls',
  DNS: 'dns',
  AD: 'identity',
  SMB: 'identity',
  GPO: 'identity',
  IPV6: 'ipv6',
  VPN: 'routing',
  WIFI: 'wifi',
}
for (const [course, skill] of Object.entries(academyBindings)) {
  taskSkills.set(`LAB-${course.toLowerCase()}`, skill)
  for (let question = 1; question <= 4; question++)
    taskSkills.set(`ADV-${course}-${question}`, skill)
}
for (let question = 1; question <= 8; question++)
  taskSkills.set(`PRACTICE-subnet-${question}`, 'addressing')
const practiceBindings: Record<string, SkillId> = {
  'mtu-payload': 'routing',
  'mtu-probe': 'routing',
  capacity: 'addressing',
  'dns-ttl': 'dns',
  'srv-port': 'dns',
  'packet-loss': 'transport',
  'srv-target': 'dns',
  'route-gateway': 'routing',
  'ipv6-record': 'ipv6',
  'plan-tls': 'tls',
  'plan-dns': 'dns',
  'plan-ad': 'identity',
  'plan-smb': 'identity',
  'plan-gpo': 'identity',
  'plan-dhcp': 'addressing',
  'plan-vpn': 'routing',
  'plan-dns-context': 'dns',
  'plan-http3': 'transport',
  'plan-smb-policy': 'identity',
}
for (const [id, skill] of Object.entries(practiceBindings)) taskSkills.set(`PRACTICE-${id}`, skill)
for (const [id, skill] of Object.entries({
  'INC-DNS-001': 'dns',
  'INC-VPN-001': 'routing',
  'INC-WINUPDATE-001': 'windows',
  'INC-PRINT-001': null,
  'INC-CAMERA-001': null,
  'INC-SCALES-001': null,
} satisfies Record<string, SkillId | null>))
  taskSkills.set(id, skill)

export function taskSkill(id: string): SkillId | undefined {
  return taskSkills.get(id) ?? undefined
}
