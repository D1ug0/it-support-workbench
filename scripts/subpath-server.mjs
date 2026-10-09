import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'
import { URL } from 'node:url'

// Only a static test server: no diagnostic data or API processing.
const root = resolve('dist')
const prefix = '/preview/site/'
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1:4174')
    if (!url.pathname.startsWith(prefix) || !['GET', 'HEAD'].includes(req.method ?? '')) {
      res.writeHead(404).end()
      return
    }
    const suffix = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html'
    const path = resolve(root, suffix)
    if (!path.startsWith(root + sep) || !(await stat(path)).isFile()) {
      res.writeHead(404).end()
      return
    }
    res.setHeader('Content-Type', types[extname(path)] ?? 'application/octet-stream')
    res.setHeader('Cache-Control', 'no-store')
    res.end(req.method === 'HEAD' ? undefined : await readFile(path))
  } catch {
    res.writeHead(404).end()
  }
})
server.listen(4174, '127.0.0.1')
