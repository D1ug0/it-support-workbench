// Public compatibility facade; domain modules do not import storage or Vue.
export { professionalCases, faultIds, faultTitles } from './definitions'
export { professionalAttemptSchema, type ProfessionalAttempt } from './model'
export { startProfessional, actProfessional } from './engine'
export { hypothesisEvidence, canCompleteProfessional, finishProfessional } from './assessment'
export { professionalMarkdown } from './export'
