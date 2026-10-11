export interface ContentProvenance {
  version: number
  platform: string
  review: { status: 'reviewed' | 'pending' | 'author'; at?: string; scope: string }
  sources: Array<{ title: string; url: string }>
}

const references = {
  DNS: [
    { title: 'RFC 9499 · термины DNS', url: 'https://www.rfc-editor.org/info/rfc9499/' },
    {
      title: 'RFC 9520 · кэширование ошибок разрешения',
      url: 'https://www.rfc-editor.org/info/rfc9520/',
    },
    { title: 'RFC 8484 · DNS over HTTPS', url: 'https://www.rfc-editor.org/info/rfc8484/' },
  ],
  WEB: [{ title: 'RFC 9114 · HTTP/3', url: 'https://www.rfc-editor.org/rfc/rfc9114.html' }],
  TLS: [
    { title: 'RFC 9325 · рекомендации TLS', url: 'https://www.rfc-editor.org/info/rfc9325/' },
    { title: 'RFC 8446 · TLS 1.3', url: 'https://www.rfc-editor.org/info/rfc8446/' },
  ],
  IDENTITY: [
    {
      title: 'Microsoft Learn · SMB signing',
      url: 'https://learn.microsoft.com/en-us/windows-server/storage/file-server/smb-signing-overview',
    },
  ],
} satisfies Record<string, Array<{ title: string; url: string }>>

const reviewed = new Set(['ADDRESS', 'ROUTES', 'DNS', 'WEB', 'TLS', 'IDENTITY'])
const linux = new Set(['LINUX', 'SERVICES', 'RECOVERY'])

export function contentProvenance(id: string, source: string, authored = false): ContentProvenance {
  const status = authored ? 'author' : reviewed.has(id) ? 'reviewed' : 'pending'
  return {
    version: !authored && reviewed.has(id) ? 2 : 1,
    platform:
      id === 'GIT'
        ? 'Git; версию Git и среду CI фиксируйте в отчёте'
        : linux.has(id)
          ? 'Linux / учебный контейнер; дистрибутив и версии пакетов фиксируйте в отчёте'
          : 'Windows 11 / Windows Server; Windows PowerShell 5.1 и PowerShell 7 различаются. Версию, редакцию ОС и shell фиксируйте в отчёте',
    review: {
      status,
      at: status === 'reviewed' ? '2026-10-11' : undefined,
      scope:
        status === 'reviewed'
          ? 'Сверены ключевые утверждения урока с первичными источниками. Это редакционная проверка; выполнения на реальной ОС не было.'
          : status === 'author'
            ? 'Материал пользователя. Актуальность и корректность проверяет автор.'
            : 'Повторная содержательная проверка этого материала пока не выполнена. Ссылку на источник используйте для уточнения версии и ограничений.',
    },
    sources: [
      { title: 'Основной первичный источник', url: source },
      ...(!authored ? (references[id as keyof typeof references] ?? []) : []),
    ],
  }
}
