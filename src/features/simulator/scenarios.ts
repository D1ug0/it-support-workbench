import data from './scenarios.json'
import { scenarioSchema } from './engine'

export const scenarios = data.map((scenario) => scenarioSchema.parse(scenario))
