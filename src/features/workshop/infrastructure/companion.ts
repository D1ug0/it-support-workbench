import { z } from 'zod'
import { workshopProgressSchema } from '../domain/skills'
import { getCompanionOrigins } from '../../../shared/companionOrigins'
export const companionOrigins = getCompanionOrigins(import.meta.env.VITE_COMPANION_ORIGIN)
export const defaultCompanionOrigin =
  companionOrigins.at(-1) === 'http://localhost:8787'
    ? 'http://127.0.0.1:8787'
    : companionOrigins.at(-1)!
export const remoteProgressSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().min(0).max(1000000),
    state: workshopProgressSchema,
  })
  .strict()
const loginSchema = z
  .object({
    schemaVersion: z.literal(1),
    token: z.string().regex(/^[a-f0-9]{64}$/),
    name: z.string().max(40),
  })
  .strict()
const explanationSchema = z
  .object({
    schemaVersion: z.literal(1),
    origin: z.enum(['local', 'external']),
    text: z.string().max(12000),
    source: z
      .url()
      .refine(
        (value) => new URL(value).protocol === 'https:',
        'Источник должен использовать HTTPS.',
      ),
  })
  .strict()
export function companionURL(value: string) {
  const url = new URL(value)
  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !(
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    )
  )
    throw new Error('Укажите HTTPS origin или HTTP loopback без пути и учётных данных.')
  return url.origin
}
export class CompanionClient {
  private token = ''
  private controller = new AbortController()
  readonly base: string
  constructor(
    url: string,
    private fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {
    this.base = companionURL(url)
    if (!companionOrigins.includes(this.base))
      throw new Error(
        'Адрес сервиса не включён в эту сборку. Владелец может задать VITE_COMPANION_ORIGIN для своего HTTPS origin.',
      )
  }
  close() {
    this.controller.abort()
    this.token = ''
  }
  private async request(path: string, method = 'GET', body?: unknown, revision?: number) {
    this.controller.signal.throwIfAborted()
    if (body !== undefined && new TextEncoder().encode(JSON.stringify(body)).length > 262144)
      throw new Error(
        'Companion принимает до 256 KiB. Этот прогресс можно перенести через общую учебную копию JSON.',
      )
    const response = await this.fetcher(`${this.base}${path}`, {
      method,
      signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(50000)]),
      credentials: 'omit',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(revision !== undefined ? { 'If-Match': String(revision) } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (Number(response.headers.get('content-length') ?? 0) > 262144)
      throw new Error('Ответ сервиса слишком большой.')
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Пустой ответ сервиса.')
    const decoder = new TextDecoder()
    let text = '',
      size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 262144) {
          await reader.cancel()
          throw new Error('Ответ сервиса превышает 256 KiB.')
        }
        text += decoder.decode(value, { stream: true })
      }
      text += decoder.decode()
    } finally {
      reader.releaseLock()
    }
    this.controller.signal.throwIfAborted()
    const value: unknown = JSON.parse(text)
    if (!response.ok) {
      const error = z.object({ error: z.string().max(500) }).safeParse(value)
      throw new Error(error.success ? error.data.error : `Ошибка сервиса ${response.status}`)
    }
    return value
  }
  async health() {
    return z
      .object({ schemaVersion: z.literal(1), aiConfigured: z.boolean() })
      .strict()
      .parse(await this.request('/api/health'))
  }
  async login(name: string, password: string, register = false) {
    const value = loginSchema.parse(
      await this.request(register ? '/api/accounts' : '/api/login', 'POST', { name, password }),
    )
    this.token = value.token
    return value.name
  }
  async read() {
    return remoteProgressSchema.parse(await this.request('/api/progress'))
  }
  async write(state: unknown, revision: number) {
    return z
      .object({ schemaVersion: z.literal(1), revision: z.number().int().min(1) })
      .strict()
      .parse(
        await this.request('/api/progress', 'PUT', workshopProgressSchema.parse(state), revision),
      )
  }
  async logout() {
    await this.request('/api/logout', 'POST')
    this.token = ''
  }
  async deleteAccount() {
    await this.request('/api/account', 'DELETE')
    this.token = ''
  }
  async explain(courseId: string, question: string, external: boolean) {
    return explanationSchema.parse(
      await this.request('/api/assistant', 'POST', { courseId, question, external }),
    )
  }
}
