export const localCompanionOrigins = ['http://127.0.0.1:8787', 'http://localhost:8787']

/** A deployment chooses one exact HTTPS origin; never inject unvalidated text into CSP. */
export function getCompanionOrigins(configured?: string) {
  if (!configured) return [...localCompanionOrigins]
  const url = new URL(configured)
  if (
    configured.length > 256 ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !/^[a-z0-9.-]+$/i.test(url.hostname)
  )
    throw new Error('VITE_COMPANION_ORIGIN должен быть точным HTTPS origin без пути и credentials.')
  return [...localCompanionOrigins, url.origin]
}
