export const skillIds = [
  'addressing',
  'routing',
  'dns',
  'transport',
  'tls',
  'windows',
  'identity',
  'linux',
  'ipv6',
  'wifi',
  'git',
  'services',
  'recovery',
  'security',
] as const
export type SkillId = (typeof skillIds)[number]
