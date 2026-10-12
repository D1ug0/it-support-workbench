import ts from 'typescript'
import { runtimeCycles } from './graph.mjs'
import { publicEntries, featureDependencies } from './config.mjs'

export const featureOf = (file) => file?.match(/^src\/features\/([^/]+)\//)?.[1]
export function layerOf(file) {
  if (file?.startsWith('src/domain/')) return 'domain'
  if (file?.startsWith('src/infrastructure/')) return 'infrastructure'
  const layer = file?.match(
    /^src\/features\/[^/]+\/(ui|components|model|application|domain|infrastructure)\//,
  )?.[1]
  return layer === 'components' ? 'ui' : layer
}
const forbiddenPackages = /^(?:vue(?:-router)?|pinia|dexie)(?:\/|$)|^node:/
const inward = {
  domain: new Set(['domain']),
  application: new Set(['application', 'domain']),
  infrastructure: new Set(['infrastructure', 'application', 'domain']),
}
const isTest = (file) => /(?:\.test\.|\.spec\.|\/__tests__\/)/.test(file)

export function forbiddenGlobalAccesses(file, source) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const names = new Set([
    'window',
    'document',
    'navigator',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'caches',
    'fetch',
    'Worker',
  ])
  const violations = new Set()
  function visit(node) {
    if (ts.isPropertyAccessExpression(node)) {
      if (ts.isIdentifier(node.expression) && names.has(node.expression.text))
        violations.add(node.expression.text)
      if (node.expression.getText(ast) === 'globalThis' && names.has(node.name.text))
        violations.add(node.name.text)
    }
    if (
      (ts.isCallExpression(node) || ts.isNewExpression(node)) &&
      ts.isIdentifier(node.expression) &&
      names.has(node.expression.text)
    )
      violations.add(node.expression.text)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return [...violations]
}

export function checkGraph(input, config = { publicEntries, featureDependencies }) {
  const graph = input.filter((n) => !isTest(n.file))
  const globals = new Map(
    graph.map((n) => [n.file, n.source ? forbiddenGlobalAccesses(n.file, n.source) : []]),
  )
  const errors = []
  const fail = (file, message) => errors.push(`${file}: ${message}`)
  for (const { file, references, source } of graph) {
    const owner = featureOf(file),
      layer = layerOf(file)
    if ((layer === 'domain' || layer === 'application') && source)
      for (const name of globals.get(file)) fail(file, `${layer} uses browser I/O: ${name}`)
    for (const ref of references) {
      if (ref.kind === 'mock') continue
      const target = ref.target,
        targetOwner = featureOf(target),
        targetLayer = layerOf(target)
      if (ref.specifier.startsWith('.') && !target && ref.kind !== 'asset')
        fail(file, `unresolved import ${ref.specifier}`)
      if (/^(?:@\/|#)/.test(ref.specifier))
        fail(file, `unsupported alias bypasses boundary resolution: ${ref.specifier}`)
      if (target && isTest(target)) fail(file, `production imports test code: ${target}`)
      if (file.startsWith('src/shared/') && targetOwner)
        fail(file, `shared imports feature ${targetOwner}`)
      if (layer === 'domain' && targetOwner && targetOwner !== owner)
        fail(file, `domain must use its own rules or shared kernel, not feature ${targetOwner}`)
      if (owner && target?.match(/^src\/(app|pages)\//))
        fail(file, `feature imports composition: ${target}`)
      if (targetOwner && targetOwner !== owner) {
        const entry = target.slice(`src/features/${targetOwner}/`.length)
        if (!config.publicEntries[targetOwner]?.includes(entry))
          fail(file, `private entry of ${targetOwner}: ${entry}`)
        if (owner && !config.featureDependencies[owner]?.includes(targetOwner))
          fail(file, `undeclared feature dependency ${owner} -> ${targetOwner}`)
      }
      if ((layer === 'domain' || layer === 'application') && forbiddenPackages.test(ref.specifier))
        fail(file, `${layer} imports UI/storage/runtime package ${ref.specifier}`)
      if (inward[layer] && targetLayer && !inward[layer].has(targetLayer))
        fail(file, `outward dependency ${layer} -> ${targetLayer}: ${target}`)
      if (
        (layer === 'ui' || file.endsWith('.vue')) &&
        (/^dexie(?:\/|$)/.test(ref.specifier) ||
          target === 'src/infrastructure/learning-storage/database.ts')
      )
        fail(file, 'UI must use repository operations, not Dexie tables')
      if (
        (layer === 'ui' || file.endsWith('.vue')) &&
        (ref.importedNames ?? []).some((name) =>
          [
            'workshopDb',
            'learningTables',
            'drafts',
            'professionalAttempts',
            'standAttempts',
          ].includes(name),
        )
      )
        fail(file, 'UI imports a raw learning table; expose a repository operation instead')
    }
  }
  for (const cycle of runtimeCycles(graph))
    errors.push(`Runtime import cycle: ${cycle.join(' -> ')}`)
  // Check the full runtime closure: a public facade must not smuggle Vue/storage into the domain.
  const nodes = new Map(graph.map((n) => [n.file, n]))
  for (const origin of graph.filter((n) => ['domain', 'application'].includes(layerOf(n.file)))) {
    const seen = new Set()
    function visit(file) {
      if (seen.has(file)) return
      seen.add(file)
      const node = nodes.get(file)
      if (!node) return
      for (const name of globals.get(file) ?? [])
        fail(origin.file, `impure browser I/O through ${file}: ${name}`)
      for (const ref of node.references.filter(
        (r) => !r.typeOnly && ['static', 'dynamic'].includes(r.kind),
      )) {
        if (
          forbiddenPackages.test(ref.specifier) ||
          ['ui', 'model', 'infrastructure'].includes(layerOf(ref.target))
        ) {
          fail(
            origin.file,
            `impure runtime dependency through ${file}: ${ref.target ?? ref.specifier}`,
          )
          continue
        }
        if (ref.target) visit(ref.target)
      }
    }
    visit(origin.file)
  }
  // Companion deliberately runs native .ts files; Vite resolution must not hide missing extensions.
  const nativeSeen = new Set()
  function native(file) {
    if (nativeSeen.has(file)) return
    nativeSeen.add(file)
    for (const ref of nodes.get(file)?.references ?? []) {
      if (ref.typeOnly || ref.kind !== 'static' || !ref.target) continue
      if (ref.target.endsWith('.ts') && !ref.specifier.endsWith('.ts'))
        fail(file, `native Node import needs .ts extension: ${ref.specifier}`)
      native(ref.target)
    }
  }
  for (const file of nodes.keys()) if (file.startsWith('server/')) native(file)
  return [...new Set(errors)].sort()
}
