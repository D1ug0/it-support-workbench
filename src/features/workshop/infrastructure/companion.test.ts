import { describe, expect, it, vi } from 'vitest'
import { CompanionClient, companionURL } from './companion'
import { emptyWorkshop } from '../domain/skills'
const response = (value: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(value), { status, headers })
const login = { schemaVersion: 1, name: 'student', token: 'a'.repeat(64) }
function setup(values: Response[]) {
  const fetcher = vi.fn<typeof fetch>()
  for (const value of values) fetcher.mockResolvedValueOnce(value)
  return { fetcher, client: new CompanionClient('http://127.0.0.1:8787', fetcher) }
}
describe('explicit companion transport', () => {
  it('makes no network request until an explicit action', () => {
    const { fetcher } = setup([])
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('requires the service to match the deployment allowlist before any request', () => {
    const fetcher = vi.fn<typeof fetch>()
    expect(() => new CompanionClient('https://another.example', fetcher)).toThrow('эту сборку')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each([
    'http://example.com',
    'https://user:password@example.com',
    'https://example.com/api',
    'https://example.com/?token=secret',
    'file:///tmp/app',
    'javascript:alert(1)',
    'https://example.com/#secret',
  ])('rejects unsafe origin %s', (url) => expect(() => companionURL(url)).toThrow())
  it.each([
    'http://127.0.0.1:8787',
    'http://localhost:8787',
    'http://[::1]:8787',
    'https://example.com',
  ])('accepts selected origin %s', (url) => expect(companionURL(url)).toBe(new URL(url).origin))
  it('keeps credentials out of progress payload and uses revision precondition', async () => {
    const { client, fetcher } = setup([
      response(login),
      response({ schemaVersion: 1, revision: 1 }),
    ])
    await client.login('student', 'temporary-password', true)
    await client.write(emptyWorkshop(), 0)
    expect(fetcher.mock.calls[0]![0]).toContain('/api/accounts')
    const options = fetcher.mock.calls[1]![1]!
    expect(options.credentials).toBe('omit')
    expect(options.cache).toBe('no-store')
    expect(options.headers).toMatchObject({
      Authorization: `Bearer ${login.token}`,
      'If-Match': '0',
    })
    expect(JSON.parse(options.body as string)).toEqual(emptyWorkshop())
    expect(options.body).not.toContain('temporary-password')
  })
  it('validates metadata before any upload and surfaces conflicts', async () => {
    const { client, fetcher } = setup([response({ error: 'Другая ревизия.' }, 409)])
    await expect(client.write({ ...emptyWorkshop(), rawLogs: 'PRIVATE' }, 0)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
    await expect(client.write(emptyWorkshop(), 0)).rejects.toThrow('Другая ревизия.')
  })
  it('rejects malformed and oversized server responses', async () => {
    const { client } = setup([
      response({ schemaVersion: 99 }),
      response({ schemaVersion: 1, revision: 0, state: emptyWorkshop(), rawLogs: 'PRIVATE' }),
      response('x', 200, { 'Content-Length': '262145' }),
      new Response('x'.repeat(262145)),
    ])
    await expect(client.health()).rejects.toThrow()
    await expect(client.read()).rejects.toThrow()
    await expect(client.health()).rejects.toThrow('слишком большой')
    await expect(client.health()).rejects.toThrow('256 KiB')
  })
  it('clears bearer token after logout and blocks requests after close', async () => {
    const { client, fetcher } = setup([
      response(login),
      response({ ok: true }),
      response({ schemaVersion: 1, aiConfigured: false }),
    ])
    await client.login('student', 'temporary-password')
    await client.logout()
    await client.health()
    expect(fetcher.mock.calls[2]![1]!.headers).not.toHaveProperty('Authorization')
    client.close()
    await expect(client.health()).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(fetcher.mock.calls[0]![1]!.signal?.aborted).toBe(true)
  })
  it('requires HTTPS citations and distinguishes local/external explanations', async () => {
    const { client } = setup([
      response({
        schemaVersion: 1,
        origin: 'local',
        text: 'Учебное объяснение',
        source: 'https://example.com/material',
      }),
      response({ schemaVersion: 1, origin: 'external', text: 'AI', source: 'javascript:alert(1)' }),
    ])
    expect((await client.explain('DNS', 'Почему кэш?', false)).origin).toBe('local')
    await expect(client.explain('DNS', 'Вопрос', true)).rejects.toThrow()
  })
})

it('binds the default native browser transport to globalThis', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = function (this: typeof globalThis) {
      expect(this).toBe(globalThis)
      return Promise.resolve(response({ schemaVersion: 1, aiConfigured: false }))
    }
    expect((await new CompanionClient('http://127.0.0.1:8787').health()).aiConfigured).toBe(false)
  } finally {
    globalThis.fetch = original
  }
})
