import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { resolve, relative, dirname, extname, sep } from 'node:path'
import ts from 'typescript'

export const posix = (path) => path.split(sep).join('/')
export function sourceFiles(root, directories = ['src', 'server']) {
  const files = []
  function visit(directory) {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, item.name)
      if (item.isDirectory()) visit(path)
      else if (/\.(?:tsx?|jsx?|vue|mjs)$/.test(path)) files.push(posix(relative(root, path)))
    }
  }
  for (const directory of directories) visit(resolve(root, directory))
  return files.sort()
}

/** Parse module references, including lazy imports and SFC scripts, without matching comments. */
export function references(file, source) {
  const blocks =
    extname(file) === '.vue'
      ? [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((match) => ({
          text: match[1],
          offset: match.index + match[0].indexOf('>') + 1,
        }))
      : [{ text: source, offset: 0 }]
  const result = []
  for (const block of blocks) {
    const ast = ts.createSourceFile(
      file,
      block.text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const add = (node, kind, typeOnly = false) => {
      if (!ts.isStringLiteralLike(node)) return
      result.push({
        specifier: node.text,
        start: block.offset + node.getStart(ast) + 1,
        end: block.offset + node.getEnd() - 1,
        kind,
        typeOnly,
      })
    }
    function visit(node) {
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause
        const names = clause?.namedBindings
        const typeOnly =
          clause?.isTypeOnly ||
          (!clause?.name &&
            names &&
            ts.isNamedImports(names) &&
            names.elements.length > 0 &&
            names.elements.every((n) => n.isTypeOnly))
        add(node.moduleSpecifier, 'static', !!typeOnly)
        result.at(-1).importedNames =
          names && ts.isNamedImports(names)
            ? names.elements.map((n) => n.propertyName?.text ?? n.name.text)
            : []
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        const typeOnly =
          node.isTypeOnly ||
          (node.exportClause &&
            ts.isNamedExports(node.exportClause) &&
            node.exportClause.elements.length > 0 &&
            node.exportClause.elements.every((n) => n.isTypeOnly))
        add(node.moduleSpecifier, 'static', !!typeOnly)
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
        add(node.argument.literal, 'type', true)
      } else if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node.arguments[0], 'dynamic')
        else if (
          ts.isPropertyAccessExpression(node.expression) &&
          ['mock', 'unmock', 'doMock', 'doUnmock'].includes(node.expression.name.text)
        )
          add(node.arguments[0], 'mock')
      } else if (
        ts.isNewExpression(node) &&
        node.expression.getText(ast) === 'URL' &&
        node.arguments?.[1]?.getText(ast) === 'import.meta.url'
      )
        add(node.arguments[0], 'asset')
      ts.forEachChild(node, visit)
    }
    visit(ast)
  }
  return result
}

export function resolveReference(root, file, specifier, kind) {
  if (!specifier.startsWith('.')) return undefined
  const path = resolve(root, dirname(file), specifier.replace(/[?#].*$/, ''))
  for (const candidate of [
    path,
    ...['.ts', '.vue', '.mjs', '.js', '.json', '.css'].map((e) => path + e),
    resolve(path, 'index.ts'),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile())
      return posix(relative(root, candidate))
  }
  if (kind === 'asset' && existsSync(path) && statSync(path).isDirectory())
    return posix(relative(root, path)) + '/'
  return undefined
}

export function readGraph(root, directories) {
  return sourceFiles(root, directories).map((file) => ({
    file,
    references: references(file, readFileSync(resolve(root, file), 'utf8')).map((ref) => ({
      ...ref,
      target: resolveReference(root, file, ref.specifier, ref.kind),
    })),
  }))
}

export function runtimeCycles(graph) {
  const nodes = new Map(
    graph.map((node) => [
      node.file,
      node.references
        .filter((ref) => !ref.typeOnly && ref.kind === 'static' && ref.target)
        .map((ref) => ref.target),
    ]),
  )
  const stack = [],
    active = new Set(),
    indices = new Map(),
    lows = new Map(),
    cycles = []
  let index = 0
  function visit(file) {
    indices.set(file, index)
    lows.set(file, index++)
    stack.push(file)
    active.add(file)
    for (const next of nodes.get(file) ?? []) {
      if (!nodes.has(next)) continue
      if (!indices.has(next)) {
        visit(next)
        lows.set(file, Math.min(lows.get(file), lows.get(next)))
      } else if (active.has(next)) lows.set(file, Math.min(lows.get(file), indices.get(next)))
    }
    if (lows.get(file) !== indices.get(file)) return
    const component = []
    let current
    do {
      current = stack.pop()
      active.delete(current)
      component.push(current)
    } while (current !== file)
    if (component.length > 1 || nodes.get(file).includes(file)) cycles.push(component.sort())
  }
  for (const file of nodes.keys()) if (!indices.has(file)) visit(file)
  return cycles.sort((a, b) => a[0].localeCompare(b[0]))
}
