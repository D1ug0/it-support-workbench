import { useRoute, useRouter } from 'vue-router'
import { computed, onMounted, ref, watch } from 'vue'
import { confirmDiscardForms, useUnsavedChanges } from '../../../shared/unsavedChanges'
import { loadCollection } from '../../../shared/persistence/collectionLoader'
import { useWorkshopStore } from './useWorkshopStore'
import { professionalExplanationReport } from '../domain/professional/report'
import {
  professionalCases,
  startProfessional,
  actProfessional,
  finishProfessional,
  professionalAttemptSchema,
  type ProfessionalAttempt,
  faultTitles,
} from '../domain/professional/index'
import {
  readProfessionalAttempts,
  getProfessionalAttempt,
  deleteProfessionalAttempt,
  saveProfessional,
} from '../infrastructure/professionalRepository'
export function useProfessionalSession() {
  const workshop = useWorkshopStore(),
    route = useRoute(),
    router = useRouter()
  const initialCase = professionalCases.find((c) => c.id === route.query.incident)?.id ?? 'portal'
  const caseId = ref<ProfessionalAttempt['caseId']>(initialCase),
    variant = ref(
      [0, 1, 2].includes(Number(route.query.variant)) ? Number(route.query.variant) : 0,
    ),
    attempt = ref(startProfessional(initialCase, variant.value))
  const current = computed(() => professionalCases.find((c) => c.id === attempt.value.caseId)!)
  const explanationReport = computed(() => professionalExplanationReport(attempt.value))
  const confirmedCauses = computed(() =>
    attempt.value.hypothesisFaults.map((f) => faultTitles[f]).join(', '),
  )
  const reason = ref(''),
    actionRefs = ref<number[]>([]),
    action = ref('clarify'),
    error = ref(''),
    notice = ref(''),
    consent = ref(false),
    busy = ref(false)
  const saved = ref<ProfessionalAttempt[]>([])
  const { markSaved } = useUnsavedChanges(
    () => JSON.stringify({ attempt: attempt.value, reason: reason.value }),
    (to) =>
      to.path === '/learning' &&
      to.query.view === 'workshop' &&
      to.query.new !== '1' &&
      (to.query.workshop !== 'professional' ||
        !to.query.attempt ||
        to.query.attempt === attempt.value.id),
  )
  const actions: Array<[string, string]> = [
    ['clarify', 'Уточнить заявку'],
    ['scope', 'Определить масштаб'],
    ['dns', 'Сопоставить DNS и кэш'],
    ['path', 'Исследовать путь'],
    ['tcp', 'Проверить TCP'],
    ['http', 'Проверить HTTP/readiness'],
    ['journal', 'Изучить журнал зависимости'],
    ['permissions', 'Проверить права'],
    ['backup', 'Проверить копии'],
    ['content', 'Проверить содержимое'],
    ['repair:cache', 'Исправить клиентский кэш'],
    ['repair:dns', 'Исправить клиентский DNS'],
    ['repair:route', 'Исправить маршрут'],
    ['repair:service', 'Восстановить службу'],
    ['repair:dependency', 'Восстановить зависимость'],
    ['repair:backup', 'Восстановить проверенную копию в новое окружение'],
    ['escalate', 'Эскалировать владельцу доступа'],
    ['verify', 'Проверить пользовательскую операцию'],
    ['rollback', 'Откатить последнее изменение'],
  ]
  onMounted(async () => {
    const loaded = loadCollection(
      'professionalAttempts',
      await readProfessionalAttempts().catch(() => []),
      professionalAttemptSchema,
    )
    saved.value = loaded.valid
    const requested =
      route.query.new === '1'
        ? undefined
        : typeof route.query.attempt === 'string'
          ? route.query.attempt
          : [...saved.value]
              .sort((a, b) => Date.parse(a.updatedAt ?? a.at) - Date.parse(b.updatedAt ?? b.at))
              .reverse()
              .find(
                (a) =>
                  a.status === 'active' &&
                  (!route.query.incident || a.caseId === route.query.incident),
              )?.id
    if (requested) await loadAttempt(requested)
    else await syncRoute()
    if (loaded.problems.length)
      error.value = 'Есть проблемные попытки; исходные записи доступны в настройках.'
  })
  function syncRoute() {
    return router.replace({
      path: '/learning',
      query: {
        view: 'workshop',
        workshop: 'professional',
        incident: attempt.value.caseId,
        attempt: attempt.value.id,
      },
    })
  }
  async function loadAttempt(id: string) {
    if (id === attempt.value.id) return
    const parsed = professionalAttemptSchema.safeParse(
      await getProfessionalAttempt(id).catch(() => undefined),
    )
    if (!parsed.success) {
      error.value =
        'Указанная попытка не найдена. Выберите сохранённую запись или явно начните новую.'
      return
    }
    attempt.value = parsed.data
    caseId.value = parsed.data.caseId
    variant.value = parsed.data.variant
    reason.value = ''
    actionRefs.value = []
    consent.value = false
    error.value = ''
    markSaved()
    if (route.query.workshop === 'professional') await syncRoute()
  }
  watch(
    () => [
      route.query.attempt,
      route.query.new,
      route.query.incident,
      route.query.variant,
      route.query.workshop,
    ],
    ([id, fresh, incident, nextVariant, panel]) => {
      if (panel !== 'professional') return
      if (fresh === '1') {
        // The final-task link explicitly requests a new attempt; router already guarded the transition.
        const next = professionalCases.find((c) => c.id === incident)
        if (!next) return
        caseId.value = next.id
        variant.value = [0, 1, 2].includes(Number(nextVariant)) ? Number(nextVariant) : 0
        attempt.value = startProfessional(caseId.value, variant.value)
        reason.value = ''
        actionRefs.value = []
        consent.value = false
        error.value = ''
        notice.value = ''
        markSaved()
        void syncRoute()
      } else if (typeof id === 'string') void loadAttempt(id)
    },
  )
  function start() {
    if (busy.value || !confirmDiscardForms()) return
    attempt.value = startProfessional(caseId.value, variant.value)
    reason.value = ''
    actionRefs.value = []
    consent.value = false
    error.value = ''
    notice.value = ''
    markSaved()
    void syncRoute()
  }
  function run() {
    if (busy.value) return
    try {
      attempt.value = actProfessional(attempt.value, action.value, reason.value, actionRefs.value)
      reason.value = ''
      actionRefs.value = []
      error.value = ''
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Действие не выполнено.'
    }
  }
  async function finish() {
    if (busy.value) return
    busy.value = true
    try {
      attempt.value = finishProfessional(attempt.value)
      const result = await workshop.addEvent({
        attemptId: attempt.value.id,
        module: 'professional',
        taskId: attempt.value.caseId,
        skill: current.value.skill,
        at: new Date().toISOString(),
        score: attempt.value.score,
        outcome: 'completed',
      })
      notice.value =
        result.status === 'saved'
          ? 'Результат сохранён в общем процессе.'
          : result.status === 'failed'
            ? result.error
            : 'Результат в памяти; сохраните попытку явно.'
      error.value = ''
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Цели ещё не достигнуты.'
    } finally {
      busy.value = false
    }
  }
  async function save() {
    if (!consent.value || busy.value) return
    const parsed = professionalAttemptSchema.safeParse(attempt.value)
    if (!parsed.success) {
      error.value = parsed.error.issues[0]?.message ?? 'Уточните отчёт перед сохранением.'
      return
    }
    const snapshot = parsed.data
    busy.value = true
    try {
      const stored = await saveProfessional(snapshot)
      saved.value = [...saved.value.filter((a) => a.id !== stored.id), stored]
      const unchanged =
        JSON.stringify(snapshot) === JSON.stringify(professionalAttemptSchema.parse(attempt.value))
      if (attempt.value.id === snapshot.id) {
        attempt.value.storageToken = stored.storageToken
        attempt.value.updatedAt = stored.updatedAt
        attempt.value.reportHistory = stored.reportHistory
        attempt.value.reportVersion = stored.reportVersion
      }
      if (!reason.value && unchanged) markSaved()
      notice.value = 'Конкретная попытка сохранена; можно продолжить после перезагрузки.'
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Попытка не сохранена.'
    } finally {
      busy.value = false
    }
  }
  async function resume(id: string) {
    if (busy.value || !confirmDiscardForms()) return
    // Re-read IndexedDB rather than a stale list from component mount.
    const value = professionalAttemptSchema.safeParse(
      await getProfessionalAttempt(id).catch(() => undefined),
    )
    if (!value.success) {
      error.value = 'Сохранённая попытка недоступна.'
      return
    }
    attempt.value = value.data
    caseId.value = value.data.caseId
    variant.value = value.data.variant
    reason.value = ''
    actionRefs.value = []
    consent.value = false
    markSaved()
    error.value = ''
    await syncRoute()
  }
  async function remove(id: string) {
    if (!window.confirm('Удалить выбранную учебную попытку?')) return
    try {
      await deleteProfessionalAttempt(id)
      saved.value = saved.value.filter((a) => a.id !== id)
    } catch {
      error.value = 'Удаление не удалось.'
    }
  }

  return {
    workshop,
    route,
    caseId,
    variant,
    attempt,
    current,
    explanationReport,
    confirmedCauses,
    reason,
    actionRefs,
    action,
    error,
    notice,
    consent,
    busy,
    saved,
    actions,
    start,
    run,
    finish,
    save,
    resume,
    remove,
  }
}
