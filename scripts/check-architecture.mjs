import process from 'node:process'
import console from 'node:console'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readGraph, runtimeCycles } from './architecture/graph.mjs'
import { checkGraph, featureOf } from './architecture/rules.mjs'

const root = process.cwd()
const graph = readGraph(root).map((node) => ({
  ...node,
  source: readFileSync(resolve(root, node.file), 'utf8'),
}))
const errors = checkGraph(graph)
const production = graph.filter(
  (n) => !n.file.endsWith('.test.ts') && !n.file.includes('/__tests__/'),
)
const report = {
  files: production.length,
  imports: production.reduce((n, file) => n + file.references.length, 0),
  featureDependencies: [
    ...new Set(
      production.flatMap((n) =>
        n.references
          .filter(
            (ref) =>
              featureOf(n.file) &&
              featureOf(ref.target) &&
              featureOf(n.file) !== featureOf(ref.target),
          )
          .map((ref) => `${featureOf(n.file)} -> ${featureOf(ref.target)}`),
      ),
    ),
  ].sort(),
  cycles: runtimeCycles(production),
  errors,
}
const output = process.argv.indexOf('--report')
if (output !== -1) {
  if (!process.argv[output + 1]) throw new Error('--report requires a file path')
  writeFileSync(resolve(root, process.argv[output + 1]), JSON.stringify(report, null, 2) + '\n')
}
if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else
  console.log(
    `Architecture OK: ${report.files} production files, ${report.imports} imports, no runtime cycles.`,
  )
