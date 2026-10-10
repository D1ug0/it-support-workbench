import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCompanion } from './companion.mjs'
import { emptyWorkshop } from '../src/features/workshop/skills.ts'
async function withServer(fn, options = {}) {
  const app = createCompanion(options)
  try {
    await new Promise((resolve, reject) => {
      app.server.once('error', reject)
      app.server.listen(0, '127.0.0.1', resolve)
    })
  } catch (error) {
    app.close()
    throw error
  }
  const url = `http://127.0.0.1:${app.server.address().port}`
  const request = (path, method = 'GET', body, token, revision, origin) =>
    globalThis.fetch(url + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(revision !== undefined ? { 'If-Match': String(revision) } : {}),
        ...(origin ? { Origin: origin } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  try {
    await fn(request)
  } finally {
    app.close()
  }
}
const user = { name: 'learner', password: 'test-password-only' }
async function register(request, name = user.name) {
  const response = await request('/api/accounts', 'POST', { ...user, name })
  assert.equal(response.status, 200)
  return (await response.json()).token
}
test('requires authentication and rejects unknown browser origins', () =>
  withServer(async (request) => {
    assert.equal((await request('/api/progress')).status, 401)
    assert.equal(
      (
        await request(
          '/api/health',
          'GET',
          undefined,
          undefined,
          undefined,
          'https://untrusted.example',
        )
      ).status,
      403,
    )
    assert.equal((await request('/api/health')).status, 200)
  }))
test('registration, wrong password and login produce bounded sessions', () =>
  withServer(async (request) => {
    const token = await register(request)
    assert.match(token, /^[a-f0-9]{64}$/)
    assert.equal((await request('/api/accounts', 'POST', user)).status, 409)
    assert.equal(
      (await request('/api/login', 'POST', { ...user, password: 'wrong-password' })).status,
      401,
    )
    assert.equal((await request('/api/login', 'POST', user)).status, 200)
    assert.equal(
      (await request('/api/accounts', 'POST', { ...user, name: 'bad name' })).status,
      400,
    )
  }))
test('progress revisions prevent overwrites and accounts remain isolated', () =>
  withServer(async (request) => {
    const first = await register(request),
      second = await register(request, 'second-user')
    const progress = { ...emptyWorkshop(), track: 'network' }
    assert.equal((await request('/api/progress', 'PUT', progress, first)).status, 428)
    assert.equal((await request('/api/progress', 'PUT', progress, first, 0)).status, 200)
    assert.equal((await request('/api/progress', 'PUT', progress, first, 0)).status, 409)
    const saved = await (await request('/api/progress', 'GET', undefined, first)).json()
    assert.equal(saved.revision, 1)
    assert.equal(saved.state.track, 'network')
    const other = await (await request('/api/progress', 'GET', undefined, second)).json()
    assert.equal(other.revision, 0)
    assert.equal(other.state.track, 'L1')
  }))
test('whitelist rejects diagnostic input, history and unknown payload fields', () =>
  withServer(async (request) => {
    const token = await register(request)
    assert.equal(
      (
        await request(
          '/api/progress',
          'PUT',
          { ...emptyWorkshop(), rawLogs: 'PRIVATE-MARKER' },
          token,
          0,
        )
      ).status,
      400,
    )
    assert.equal(
      (
        await request(
          '/api/progress',
          'PUT',
          { ...emptyWorkshop(), attempts: [{ command: 'SECRET' }] },
          token,
          0,
        )
      ).status,
      400,
    )
  }))
test('logout invalidates bearer token', () =>
  withServer(async (request) => {
    const token = await register(request)
    assert.equal((await request('/api/logout', 'POST', undefined, token)).status, 200)
    assert.equal((await request('/api/progress', 'GET', undefined, token)).status, 401)
  }))
test('account deletion removes progress and sessions', () =>
  withServer(async (request) => {
    const token = await register(request)
    await request('/api/progress', 'PUT', emptyWorkshop(), token, 0)
    assert.equal((await request('/api/account', 'DELETE', undefined, token)).status, 200)
    assert.equal((await request('/api/progress', 'GET', undefined, token)).status, 401)
    const next = await register(request)
    assert.equal(
      (await (await request('/api/progress', 'GET', undefined, next)).json()).revision,
      0,
    )
  }))
test('local explanation works and external AI is disabled without configuration', () =>
  withServer(async (request) => {
    const token = await register(request),
      body = { courseId: 'DNS', question: 'Как проверить кэш?', external: false }
    const response = await request('/api/assistant', 'POST', body, token)
    assert.equal(response.status, 200)
    assert.equal((await response.json()).origin, 'local')
    assert.equal(
      (await request('/api/assistant', 'POST', { ...body, external: true }, token)).status,
      503,
    )
  }))
test('AI contract uses server key, explicit model, store:false and no diagnostic data', async () => {
  let calls = 0
  await withServer(
    async (request) => {
      const token = await register(request)
      const response = await request(
        '/api/assistant',
        'POST',
        { courseId: 'DNS', question: 'Объясни TTL', external: true },
        token,
      )
      assert.equal(response.status, 200)
      assert.equal((await response.json()).text, 'Учебное объяснение')
      assert.equal(calls, 1)
    },
    {
      aiKey: 'test-not-a-real-key',
      aiModel: 'test-model',
      fetcher: async (url, options) => {
        calls++
        assert.equal(url, 'https://api.openai.com/v1/responses')
        assert.equal(options.headers.Authorization, 'Bearer test-not-a-real-key')
        const body = JSON.parse(options.body)
        assert.equal(body.store, false)
        assert.equal(body.model, 'test-model')
        assert.equal(body.max_output_tokens, 1200)
        assert.ok(!body.input.includes('PRIVATE-MARKER'))
        return new globalThis.Response(
          JSON.stringify({
            output: [
              { type: 'message', content: [{ type: 'output_text', text: 'Учебное объяснение' }] },
            ],
          }),
          { status: 200 },
        )
      },
    },
  )
})

test('provider network and malformed response failures remain controlled', async () => {
  for (const fetcher of [
    async () => {
      throw new Error('provider unavailable')
    },
    async () => new globalThis.Response(JSON.stringify({ output: 'invalid' })),
    async () => new globalThis.Response('x'.repeat(1048577)),
  ]) {
    await withServer(
      async (request) => {
        const token = await register(request)
        const response = await request(
          '/api/assistant',
          'POST',
          { courseId: 'DNS', question: 'Почему кэш?', external: true },
          token,
        )
        assert.equal(response.status, 502)
        assert.ok(!(await response.text()).includes('test-secret'))
      },
      { aiKey: 'test-secret', aiModel: 'test-model', fetcher },
    )
  }
})
