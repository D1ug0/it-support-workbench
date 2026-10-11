<script setup lang="ts">
import AppSelect from '../../shared/components/AppSelect.vue'
import AppSelectOption from '../../shared/components/AppSelectOption.vue'
import { useRoute, useRouter } from 'vue-router'
import { computed, onMounted, ref, watch } from 'vue'
import { confirmDiscardForms, useUnsavedChanges } from '../../shared/unsavedChanges'
import { downloadText } from '../../infrastructure/export/exportReport'
import { loadCollection } from './collectionLoader'
import { useWorkshopStore } from './useWorkshopStore'
import HypothesisTable from './HypothesisTable.vue'
import {
  professionalCases,
  startProfessional,
  actProfessional,
  finishProfessional,
  professionalAttempts,
  professionalAttemptSchema,
  saveProfessional,
  professionalMarkdown,
  type ProfessionalAttempt,
  faultTitles,
} from './professional'
const workshop = useWorkshopStore(),
  route = useRoute(),
  router = useRouter()
const initialCase = professionalCases.find((c) => c.id === route.query.incident)?.id ?? 'portal'
const caseId = ref<ProfessionalAttempt['caseId']>(initialCase),
  variant = ref([0, 1, 2].includes(Number(route.query.variant)) ? Number(route.query.variant) : 0),
  attempt = ref(startProfessional(initialCase, variant.value))
const current = computed(() => professionalCases.find((c) => c.id === attempt.value.caseId)!)
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
    await professionalAttempts.toArray().catch(() => []),
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
    await professionalAttempts.get(id).catch(() => undefined),
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
  const snapshot = professionalAttemptSchema.parse(attempt.value)
  busy.value = true
  try {
    const stored = await saveProfessional(snapshot)
    saved.value = [...saved.value.filter((a) => a.id !== stored.id), stored]
    const unchanged =
      JSON.stringify(snapshot) === JSON.stringify(professionalAttemptSchema.parse(attempt.value))
    if (attempt.value.id === snapshot.id) {
      attempt.value.storageToken = stored.storageToken
      attempt.value.updatedAt = stored.updatedAt
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
    await professionalAttempts.get(id).catch(() => undefined),
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
    await professionalAttempts.delete(id)
    saved.value = saved.value.filter((a) => a.id !== id)
  } catch {
    error.value = 'Удаление не удалось.'
  }
}
</script>
<template>
  <section class="panel feature-section">
    <h3>Сквозные профессиональные инциденты</h3>
    <p>
      Ограниченная синтетическая среда. Причины заранее не раскрываются; доступны несколько порядков
      диагностики. Объясняйте гипотезу перед каждым действием. Баллы проверяют структуру процесса,
      выбранные причины и ссылки на доказательства; содержание текста ожидает разбора человеком.
      Старая рубрика сохранённых отчётов отмечается как legacy.
    </p>
    <label
      >Инцидент<AppSelect v-model="caseId" class="text-input">
        <AppSelectOption v-for="c in professionalCases" :key="c.id" :value="c.id">{{
          c.title
        }}</AppSelectOption>
      </AppSelect></label
    >
    <label v-if="caseId !== 'unknown'"
      >Незнакомый вариант<AppSelect v-model="variant" class="text-input">
        <AppSelectOption v-for="i in 3" :key="i" :value="i - 1">{{ i }}</AppSelectOption>
      </AppSelect></label
    ><button class="button secondary" :disabled="busy" @click="start">
      Начать профессиональный инцидент
    </button>
    <h4>{{ current.title }}</h4>
    <p>{{ current.brief }}</p>
    <p v-if="attempt.caseId === 'unknown'">
      Причина выбирается при старте и сохраняется с попыткой. Для изменения сначала подтвердите
      гипотезу наблюдением в таблице и выберите проверки, обосновывающие действие.
    </p>
    <p>
      Время: {{ current.minutes }} мин · предпосылки: {{ current.requires.join(', ') }} · попытка
      {{ attempt.id }}
    </p>
    <RouterLink
      class="text-link"
      :to="`/learning?view=workshop&lesson=${current.skill === 'dns' ? 'DNS' : current.skill === 'identity' ? 'IDENTITY' : current.skill === 'recovery' ? 'RECOVERY' : 'SERVICES'}&returnAttempt=${attempt.id}`"
      >Повторить объяснение и вернуться к этой попытке</RouterLink
    >
    <template v-if="attempt.status === 'active'"
      ><label
        >Следующая проверка или действие<AppSelect v-model="action" class="text-input">
          <AppSelectOption v-for="[id, title] in actions" :key="id" :value="id">{{
            title
          }}</AppSelectOption>
        </AppSelect></label
      ><label
        >Гипотеза и обоснование<textarea
          v-model="reason"
          class="text-input"
          maxlength="600"
        /></label
      ><button class="button primary" :disabled="busy" @click="run">
        Выполнить учебное действие
      </button></template
    >
    <fieldset v-if="attempt.status === 'active' && attempt.steps.length">
      <legend>Проверки, обосновывающие следующее изменение или эскалацию (до 10)</legend>
      <label v-for="(s, i) in attempt.steps" :key="i" class="checkbox-label"
        ><input v-model="actionRefs" type="checkbox" :value="i + 1" />#{{ i + 1 }} ·
        {{ s.action }} · ревизия {{ s.revision }}</label
      >
    </fieldset>
    <label v-if="attempt.caseId === 'recovery' && attempt.status === 'active'"
      >Проверенная копия для следующего восстановления<AppSelect
        v-model="attempt.selectedSnapshot"
        class="text-input"
      >
        <AppSelectOption :value="null">Выберите после проверки копий</AppSelectOption>
        <AppSelectOption value="09:30">09:30</AppSelectOption>
        <AppSelectOption value="10:02">10:02</AppSelectOption>
      </AppSelect></label
    >
    <ol>
      <li v-for="(s, i) in attempt.steps" :key="i">
        #{{ i + 1 }} · {{ s.action }} · ревизия {{ s.revision }} · ссылки
        {{ s.evidenceRefs.join(', ') }}
        <p>{{ s.reason }}</p>
        <p>{{ s.result }}</p>
      </li>
    </ol>
    <HypothesisTable v-model="attempt" :disabled="busy" />
    <fieldset :disabled="busy || attempt.status !== 'active'">
      <legend>Отчёт расследования</legend>
      <fieldset>
        <legend>Подтверждённые причины</legend>
        <label
          v-for="fault in [
            'cache',
            'dns',
            'route',
            'service',
            'dependency',
            'permissions',
            'backup',
          ] as const"
          :key="fault"
          class="checkbox-label"
          ><input v-model="attempt.hypothesisFaults" type="checkbox" :value="fault" />{{
            faultTitles[fault]
          }}</label
        >
      </fieldset>
      <fieldset>
        <legend>Доказательства отчёта: уточнение, масштаб, изменение и свежая проверка</legend>
        <label v-for="(s, i) in attempt.steps" :key="i" class="checkbox-label"
          ><input v-model="attempt.evidenceRefs" type="checkbox" :value="i + 1" />#{{ i + 1 }} ·
          {{ s.action }} · ревизия {{ s.revision }}</label
        >
      </fieldset>
      <label
        v-for="(label, key) in {
          symptom: 'Симптом и масштаб',
          hypothesis: 'Гипотезы',
          evidence: 'Доказательства: номера действий и ревизии',
          change: 'Минимальное изменение, откат или эскалация',
          verification: 'Пользовательская проверка и остаточные риски',
        }"
        :key="key"
        >{{ label
        }}<textarea
          v-model="attempt.report[key]"
          class="text-input"
          :maxlength="key === 'evidence' ? 1800 : 1200"
        /></label
      ><template v-if="attempt.caseId === 'recovery'">
        <p>
          Учебный RTO: {{ attempt.recoveryMinutes ?? 0 }} / 20 мин; RPO:
          {{ attempt.lossMinutes ?? 'сначала восстановите копию' }} / 5 мин. Шкала модели: чтение —
          1 мин, изменение — 2 мин, восстановление — 4 мин. Это не замер реального стенда.
        </p>
      </template>
    </fieldset>
    <button class="button primary" :disabled="busy || attempt.status !== 'active'" @click="finish">
      Завершить инцидент по целям
    </button>
    <p role="status">
      {{ attempt.status }} · оценка процесса {{ attempt.score ?? 'пока без оценки' }} · рубрика
      {{ attempt.gradingVersion || 'legacy' }} · содержание отчёта ожидает разбора человеком<span
        v-if="attempt.escalated"
      >
        · восстановление доступа ожидает владельца</span
      >
    </p>
    <p v-if="attempt.status === 'completed'">
      Подтверждённые причины: {{ confirmedCauses }}. Проверка пользовательского запроса относится к
      ревизии {{ attempt.verifiedRevision }}.
      <span v-if="attempt.caseId === 'unknown'">Завершён вариант {{ attempt.variant + 1 }}.</span>
    </p>
    <label class="checkbox-label"
      ><input v-model="consent" type="checkbox" />Проверил заметки: только учебные данные</label
    >
    <div class="button-row">
      <button class="button secondary" :disabled="!consent || busy" @click="save">
        Сохранить попытку инцидента</button
      ><button
        class="button secondary"
        :disabled="!consent"
        @click="downloadText(professionalMarkdown(attempt), 'workbench-professional.md')"
      >
        Экспорт отчёта инцидента
      </button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <button v-if="error" class="button secondary" @click="resume(attempt.id)">
      Перечитать сохранённую попытку
    </button>
    <p v-if="notice" role="status">{{ notice }}</p>
    <article v-for="a in saved" :key="a.id" class="workshop-item">
      {{ a.caseId }} ·
      {{
        a.caseId === 'unknown' && a.status !== 'completed'
          ? 'неизвестная причина'
          : `вариант ${a.variant + 1}`
      }}
      · {{ a.status
      }}<button class="button secondary" @click="resume(a.id)">
        Продолжить попытку {{ a.caseId }}</button
      ><button class="button ghost" @click="remove(a.id)">Удалить попытку {{ a.caseId }}</button>
    </article>
  </section>
</template>
