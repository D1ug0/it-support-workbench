import { test } from 'node:test'
import assert from 'node:assert/strict'
import { references, runtimeCycles } from './graph.mjs'
import { checkGraph, forbiddenGlobalAccesses } from './rules.mjs'

const ref = (target, options = {}) => ({
  target,
  specifier: './target',
  kind: 'static',
  typeOnly: false,
  ...options,
})
const node = (file, refs = [], source = '') => ({ file, references: refs, source })
const config = {
  publicEntries: { a: ['index.ts'], b: ['index.ts'] },
  featureDependencies: { a: ['b'], b: [] },
}

test('parses SFC scripts, static/type/lazy imports and mocks; ignores comments and template text', () => {
  const source = `<template>import x from './fake'</template><script setup lang="ts">
// import x from './comment'
import type { X } from './types'
export { x } from './public'
const load = () => import('./lazy')
type Y = import('./shape').Y
vi.mock('./mock')
</script>`
  const refs = references('Panel.vue', source)
  assert.deepEqual(
    refs.map((r) => [r.specifier, r.kind, r.typeOnly]),
    [
      ['./types', 'static', true],
      ['./public', 'static', false],
      ['./lazy', 'dynamic', false],
      ['./shape', 'type', true],
      ['./mock', 'mock', false],
    ],
  )
  for (const r of refs) assert.equal(source.slice(r.start, r.end), r.specifier)
})
test('distinguishes erased named type imports and type exports from runtime dependencies', () => {
  const refs = references(
    'file.ts',
    `import { type X } from './types'; export { type Y } from './types'; import { type X, y } from './mixed'`,
  )
  assert.deepEqual(
    refs.map((r) => r.typeOnly),
    [true, true, false],
  )
})
test('detects runtime cycles; type-only and lazy edges do not create initialization cycles', () => {
  const graph = [node('a', [ref('b')]), node('b', [ref('a')])]
  assert.deepEqual(runtimeCycles(graph), [['a', 'b']])
  graph[1].references[0].typeOnly = true
  assert.deepEqual(runtimeCycles(graph), [])
  graph[1].references[0] = ref('a', { kind: 'dynamic' })
  assert.deepEqual(runtimeCycles(graph), [])
})
test('rejects private imports, including lazy imports, while public domain contracts remain usable', () => {
  assert.match(
    checkGraph(
      [
        node('src/features/a/ui/Panel.vue', [
          ref('src/features/b/private.ts', { kind: 'dynamic' }),
        ]),
      ],
      config,
    ).join(),
    /private entry/,
  )
  assert.deepEqual(
    checkGraph([node('src/features/a/ui/Panel.vue', [ref('src/features/b/index.ts')])], config),
    [],
  )
})
test('rejects undeclared feature dependencies even through public entries', () => {
  assert.match(
    checkGraph(
      [node('src/features/b/model/store.ts', [ref('src/features/a/index.ts')])],
      config,
    ).join(),
    /undeclared feature dependency/,
  )
})
test('rejects outward layer dependencies and browser/storage packages', () => {
  const errors = checkGraph(
    [
      node('src/features/a/domain/rules.ts', [
        ref('src/features/a/model/store.ts'),
        ref(undefined, { specifier: 'dexie' }),
      ]),
    ],
    config,
  ).join('\n')
  assert.match(errors, /outward dependency/)
  assert.match(errors, /imports UI\/storage\/runtime package/)
})
test('a facade cannot hide a transitive dependency on Pinia or IndexedDB', () => {
  const graph = [
    node('src/features/a/domain/rules.ts', [ref('src/features/b/index.ts')]),
    node('src/features/b/index.ts', [ref('src/features/b/model/store.ts')]),
    node('src/features/b/model/store.ts', [ref(undefined, { specifier: 'pinia' })]),
  ]
  assert.match(checkGraph(graph, config).join(), /impure runtime dependency through/)
})
test('shared cannot depend on features and production cannot import test helpers', () => {
  const graph = [
    node('src/shared/helper.ts', [ref('src/features/a/index.ts')]),
    node('src/features/a/domain/logic.ts', [ref('src/features/a/domain/logic.test.ts')]),
  ]
  assert.match(checkGraph(graph, config).join(), /shared imports feature/)
  assert.match(checkGraph(graph, config).join(), /production imports test code/)
})
test('detects direct browser I/O in pure modules without matching comments or strings', () => {
  assert.deepEqual(
    forbiddenGlobalAccesses(
      'logic.ts',
      `// fetch('secret')\nconst label = 'window.localStorage'; globalThis.localStorage.getItem('x'); fetch('/api')`,
    ),
    ['localStorage', 'fetch'],
  )
})
test('detects literal computed browser access and destructured global APIs', () => {
  assert.deepEqual(
    forbiddenGlobalAccesses(
      'logic.ts',
      `globalThis['fetch']('/api'); window['location'];
       const { localStorage: storage, indexedDB } = globalThis;
       const send = fetch; const { getItem } = sessionStorage`,
    ),
    ['fetch', 'window', 'localStorage', 'indexedDB', 'sessionStorage'],
  )
})
test('allows pure global utilities, type queries and similarly named object properties', () => {
  assert.deepEqual(
    forbiddenGlobalAccesses(
      'logic.ts',
      `const { crypto, TextEncoder } = globalThis;
       const { fetch } = options; const value = options['localStorage'];
       type Browser = typeof window;
       const label = "globalThis['fetch']('/api')"`,
    ),
    [],
  )
})
test('computed browser access is rejected through a public facade', () => {
  const graph = [
    node('src/features/a/application/logic.ts', [ref('src/features/b/index.ts')]),
    node('src/features/b/index.ts', [], `const { localStorage: storage } = globalThis`),
  ]
  assert.match(checkGraph(graph, config).join(), /impure browser I\/O through.*localStorage/)
})
test('detects unresolved imports and unsupported aliases', () => {
  const graph = [
    node('src/features/a/domain/logic.ts', [
      ref(undefined),
      ref(undefined, { specifier: '@/private' }),
    ]),
  ]
  assert.match(checkGraph(graph, config).join(), /unresolved import/)
  assert.match(checkGraph(graph, config).join(), /unsupported alias/)
})
test('UI cannot import the database or Dexie, including erased table types', () => {
  assert.match(
    checkGraph(
      [
        node('src/features/a/ui/Panel.vue', [
          ref('src/infrastructure/learning-storage/database.ts'),
          ref(undefined, { specifier: 'dexie', typeOnly: true }),
        ]),
      ],
      config,
    ).join(),
    /UI must use repository operations/,
  )
})
test('UI cannot access a raw table even when it is re-exported by a repository', () => {
  assert.match(
    checkGraph(
      [
        node('src/features/a/ui/Panel.vue', [
          ref('src/features/a/infrastructure/repository.ts', { importedNames: ['drafts'] }),
        ]),
      ],
      config,
    ).join(),
    /raw learning table/,
  )
})
test('the shared domain kernel and feature domain do not depend on another feature', () => {
  const graph = [
    node('src/domain/learning/rules.ts', [ref('src/features/a/index.ts')]),
    node('src/features/b/domain/rules.ts', [ref('src/features/a/index.ts')]),
  ]
  assert.match(checkGraph(graph, config).join(), /domain must use its own rules or shared kernel/)
})
test('a public facade cannot hide browser I/O in a flat module', () => {
  const graph = [
    node('src/features/a/domain/rules.ts', [ref('src/features/b/index.ts')]),
    node('src/features/b/index.ts', [], `const load = () => globalThis.fetch('/api')`),
  ]
  assert.match(checkGraph(graph, config).join(), /impure browser I\/O through/)
})
test('native companion imports require .ts extensions through the entire public contract', () => {
  const graph = [
    node('server/companion.mjs', [
      ref('src/features/a/index.ts', { specifier: '../src/features/a/index.ts' }),
    ]),
    node('src/features/a/index.ts', [ref('src/features/a/domain/value.ts')]),
  ]
  assert.match(checkGraph(graph, config).join(), /native Node import needs .ts extension/)
  graph[1].references[0].specifier += '.ts'
  assert.deepEqual(checkGraph(graph, config), [])
})
test('native companion lazy imports require explicit .ts extensions too', () => {
  const graph = [
    node('server/entry.mjs', [
      ref('src/features/a/index.ts', { specifier: '../src/features/a/index.ts' }),
    ]),
    node('src/features/a/index.ts', [
      ref('src/features/a/domain/rules.ts', { kind: 'dynamic', specifier: './domain/rules' }),
    ]),
  ]
  assert.match(checkGraph(graph, config).join(), /native Node import needs .ts extension/)
  graph[1].references[0].specifier += '.ts'
  assert.deepEqual(checkGraph(graph, config), [])
})
