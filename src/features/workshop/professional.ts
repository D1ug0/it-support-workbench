// Public compatibility facade; domain modules do not import storage or Vue.
export { professionalCases, faultIds, faultTitles } from './professional/definitions'
export { professionalAttemptSchema, type ProfessionalAttempt } from './professional/model'
export { startProfessional, actProfessional } from './professional/engine'
export {
  hypothesisEvidence,
  canCompleteProfessional,
  finishProfessional,
} from './professional/assessment'
export { professionalAttempts, saveProfessional } from './professional/repository'
export { professionalMarkdown } from './professional/export'
