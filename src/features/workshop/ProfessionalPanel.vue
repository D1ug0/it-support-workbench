<script setup lang="ts">
import { useRoute } from 'vue-router'
import { computed, onMounted, ref } from 'vue'
import { confirmDiscardForms, useUnsavedChanges } from '../../shared/unsavedChanges'
import { downloadText } from '../../infrastructure/export/exportReport'
import { loadCollection } from './collectionLoader'
import { useWorkshopStore } from './useWorkshopStore'
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
} from './professional'
const workshop = useWorkshopStore(),
  route = useRoute()
const initialCase = professionalCases.find((c) => c.id === route.query.incident)?.id ?? 'portal'
const caseId = ref<ProfessionalAttempt['caseId']>(initialCase),
  variant = ref(0),
  attempt = ref(startProfessional(initialCase))
const current = computed(() => professionalCases.find((c) => c.id === attempt.value.caseId)!)
const reason = ref(''),
  action = ref('clarify'),
  error = ref(''),
  notice = ref(''),
  consent = ref(false),
  busy = ref(false)
const saved = ref<ProfessionalAttempt[]>([])
const { markSaved } = useUnsavedChanges(() =>
  JSON.stringify({ attempt: attempt.value, reason: reason.value }),
)
const actions = [
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
  if (loaded.problems.length)
    error.value = 'Есть проблемные попытки; исходные записи доступны в настройках.'
})
function start() {
  if (busy.value || !confirmDiscardForms()) return
  attempt.value = startProfessional(caseId.value, variant.value)
  consent.value = false
  error.value = ''
  notice.value = ''
  markSaved()
}
function run() {
  if (busy.value) return
  try {
    attempt.value = actProfessional(attempt.value, action.value, reason.value)
    reason.value = ''
    error.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Действие не выполнено.'
  }
}
async function finish() {
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
  }
}
async function save() {
  if (!consent.value || busy.value) return
  const snapshot = professionalAttemptSchema.parse(attempt.value)
  busy.value = true
  try {
    await saveProfessional(snapshot)
    saved.value = [...saved.value.filter((a) => a.id !== snapshot.id), snapshot]
    if (!reason.value && JSON.stringify(snapshot) === JSON.stringify(attempt.value)) markSaved()
    notice.value = 'Конкретная попытка сохранена; можно продолжить после перезагрузки.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Попытка не сохранена.'
  } finally {
    busy.value = false
  }
}
function resume(id: string) {
  if (busy.value || !confirmDiscardForms()) return
  const value = saved.value.find((a) => a.id === id)
  if (value) {
    attempt.value = professionalAttemptSchema.parse(value)
    consent.value = false
    markSaved()
  }
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
      диагностики. Объясняйте гипотезу перед каждым действием. Оценка проверяет цели и
      доказательства модели; качество текста требует разбора человеком.
    </p>
    <label
      >Инцидент<select v-model="caseId" class="text-input">
        <option v-for="c in professionalCases" :key="c.id" :value="c.id">{{ c.title }}</option>
      </select></label
    >
    <label
      >Незнакомый вариант<select v-model.number="variant" class="text-input">
        <option v-for="i in 3" :key="i" :value="i - 1">{{ i }}</option>
      </select></label
    ><button class="button secondary" @click="start">Начать профессиональный инцидент</button>
    <h4>{{ current.title }}</h4>
    <p>{{ current.brief }}</p>
    <p>
      Время: {{ current.minutes }} мин · предпосылки: {{ current.requires.join(', ') }} · попытка
      {{ attempt.id }}
    </p>
    <RouterLink
      class="text-link"
      :to="`/learning?view=workshop&lesson=${current.skill === 'dns' ? 'DNS' : current.skill === 'identity' ? 'IDENTITY' : current.skill === 'recovery' ? 'RECOVERY' : 'SERVICES'}`"
      >Повторить объяснение и вернуться к этой попытке</RouterLink
    >
    <template v-if="attempt.status === 'active'"
      ><label
        >Следующая проверка или действие<select v-model="action" class="text-input">
          <option v-for="[id, title] in actions" :key="id" :value="id">{{ title }}</option>
        </select></label
      ><label
        >Гипотеза и обоснование<textarea
          v-model="reason"
          class="text-input"
          maxlength="600"
        /></label
      ><button class="button primary" @click="run">Выполнить учебное действие</button></template
    >
    <ol>
      <li v-for="(s, i) in attempt.steps" :key="i">
        {{ s.action }} · ревизия {{ s.revision }}
        <p>{{ s.reason }}</p>
        <p>{{ s.result }}</p>
      </li>
    </ol>
    <fieldset :disabled="attempt.status !== 'active'">
      <legend>Отчёт расследования</legend>
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
      ><template v-if="attempt.caseId === 'recovery'"
        ><label
          >Длительность восстановления, минут<input
            v-model.number="attempt.recoveryMinutes"
            type="number"
            min="0"
            max="1440"
            class="text-input" /></label
        ><label
          >Потеря данных, минут<input
            v-model.number="attempt.lossMinutes"
            type="number"
            min="0"
            max="1440"
            class="text-input" /></label
      ></template>
    </fieldset>
    <button class="button primary" :disabled="attempt.status !== 'active'" @click="finish">
      Завершить инцидент по целям
    </button>
    <p role="status">{{ attempt.status }} · {{ attempt.score ?? 'пока без оценки' }}</p>
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
    <p v-if="notice" role="status">{{ notice }}</p>
    <article v-for="a in saved" :key="a.id" class="workshop-item">
      {{ a.caseId }} · вариант {{ a.variant + 1 }} · {{ a.status
      }}<button class="button secondary" @click="resume(a.id)">
        Продолжить попытку {{ a.caseId }}</button
      ><button class="button ghost" @click="remove(a.id)">Удалить попытку {{ a.caseId }}</button>
    </article>
  </section>
</template>
