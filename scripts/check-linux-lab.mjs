import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { randomUUID, createHash } from 'node:crypto'
import { setTimeout } from 'node:timers'
import assert from 'node:assert/strict'
import console from 'node:console'

const root = fileURLToPath(new URL('../lab-environments/linux-http/', import.meta.url))
const temp = mkdtempSync(join(tmpdir(), 'workbench-linux-check-'))
const project = `workbench-check-${randomUUID().slice(0, 8)}`
// Compose port override cannot replace a list; a fresh test file has no published ports.
const file = join(temp, 'compose.yaml')
const compose = (...args) =>
  execFileSync('docker', ['compose', '-p', project, '-f', file, ...args], {
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 1024 * 1024,
  })
const control = (service, action) =>
  compose('exec', '-T', service, 'python', '/lab/control.py', action)
function probe(
  expected,
  target = 'app',
  expectedData = { message: '12 synthetic tickets', revision: 1 },
) {
  const result = JSON.parse(
    compose(
      'exec',
      '-T',
      target,
      'python',
      '-c',
      `import urllib.request,urllib.error,json
try:
 r=urllib.request.urlopen('http://127.0.0.1:8080/ready',timeout=3)
except urllib.error.HTTPError as e:
 r=e
print(json.dumps({'status':r.code,'body':json.loads(r.read())}))`,
    ),
  )
  assert.equal(result.status, expected)
  assert.equal(result.body.ready, expected === 200)
  if (expected === 200) assert.deepEqual(result.body.data, expectedData)
  return result
}
let created = false
try {
  const dockerVersion = execFileSync('docker', ['version', '--format', '{{.Server.Version}}'], {
    encoding: 'utf8',
    timeout: 10000,
  }).trim()
  const config = JSON.parse(
    execFileSync(
      'docker',
      ['compose', '-f', join(root, 'compose.yaml'), 'config', '--format', 'json'],
      { encoding: 'utf8', timeout: 10000 },
    ),
  )
  assert.deepEqual(Object.keys(config.services).sort(), ['app', 'dependency'])
  assert.ok(
    !config.volumes || Object.keys(config.volumes).length === 0,
    'No host/production volumes in integration check',
  )
  for (const service of Object.values(config.services)) {
    assert.ok(
      !service.volumes && !service.container_name && !service.image,
      'Only isolated built services are allowed',
    )
    delete service.ports
  }
  config.name = project
  for (const network of Object.values(config.networks)) {
    assert.ok(!network.external)
    delete network.name
  }
  config.services.restored = globalThis.structuredClone(config.services.app)
  writeFileSync(file, JSON.stringify(config))
  created = true
  compose('up', '--build', '-d', '--wait', '--wait-timeout', '45')
  for (let i = 0; ; i++) {
    try {
      probe(200)
      break
    } catch (e) {
      if (i >= 20) throw e
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  assert.equal(compose('exec', '-T', 'app', 'id', '-u').trim(), '10001')
  const platform = JSON.parse(
    compose(
      'exec',
      '-T',
      'app',
      'python',
      '-c',
      "import json,sys,platform; print(json.dumps({'python':platform.python_version(),'linux':platform.release(),'distribution':platform.freedesktop_os_release().get('PRETTY_NAME')}))",
    ),
  )
  const builtImage = compose('images', '-q', 'app').trim()
  const backupAt = Date.now()
  const backup = compose('exec', '-T', 'app', 'cat', '/state/config.json')
  const hash = createHash('sha256').update(backup).digest('hex')
  control('app', 'break-permissions')
  probe(503)
  control('dependency', 'break-dependency')
  control('app', 'fix-permissions')
  probe(503)
  control('dependency', 'fix-dependency')
  probe(200)
  const outageAt = Date.now()
  control('app', 'break-permissions')
  probe(503)
  // Separate target; keep the broken source container intact until proof of recovery.
  control('restored', 'break-content')
  probe(200, 'restored', { message: 'damaged synthetic tickets', revision: 2 })
  execFileSync(
    'docker',
    [
      'compose',
      '-p',
      project,
      '-f',
      file,
      'exec',
      '-T',
      'restored',
      'python',
      '/lab/control.py',
      'restore',
    ],
    { input: backup, timeout: 10000 },
  )
  probe(200, 'restored')
  probe(503, 'app')
  const restored = compose('exec', '-T', 'restored', 'cat', '/state/config.json')
  assert.equal(createHash('sha256').update(restored).digest('hex'), hash)
  assert.throws(() =>
    execFileSync(
      'docker',
      [
        'compose',
        '-p',
        project,
        '-f',
        file,
        'exec',
        '-T',
        'restored',
        'python',
        '/lab/control.py',
        'restore',
      ],
      {
        input: '{"message":"foreign data","revision":1}',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    ),
  )
  probe(200, 'restored')
  const rtoMs = Date.now() - outageAt,
    rpoMs = outageAt - backupAt
  assert.ok(rtoMs <= 20 * 60000)
  assert.ok(rpoMs <= 5 * 60000)
  control('app', 'break-permissions')
  control('dependency', 'break-dependency')
  control('app', 'reset')
  probe(503)
  control('dependency', 'reset')
  probe(200)
  console.log(
    JSON.stringify({
      passed: true,
      environment: 'actual Linux containers',
      dockerVersion,
      platform,
      builtImage,
      rtoMs,
      rpoMs,
      backupSha256: hash,
      checks: [
        'ready',
        'permission failure',
        'two independent failures',
        'one fix still fails',
        'restored contents and operation',
        'reset both',
      ],
    }),
  )
} finally {
  try {
    if (created) compose('down', '--remove-orphans', '--rmi', 'local')
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}
