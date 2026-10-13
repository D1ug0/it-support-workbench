export const learningErrorIds = ['dns-cache', 'dns-response', 'dns-context'] as const
export type LearningErrorId = (typeof learningErrorIds)[number]
export const remediationReviewDelay = 24 * 60 * 60 * 1000

// Only these known tasks test the targeted distinction. Never classify arbitrary error text.
const taskErrors: Record<string, LearningErrorId> = {
  'question:Q-2-2': 'dns-response',
  'question:Q-2-3': 'dns-context',
  'course:DNS': 'dns-cache',
  'course:PACK-web-v2-contradiction': 'dns-cache',
  'course:PACK-web-v2-review-dns': 'dns-response',
}
export function taskErrorIds(module: string, taskId: string): LearningErrorId[] {
  const id = taskErrors[`${module}:${taskId}`]
  return id ? [id] : []
}
