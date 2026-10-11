<script setup lang="ts">
import { computed } from 'vue'
import AppSelect from '../../shared/components/AppSelect.vue'
import AppSelectOption from '../../shared/components/AppSelectOption.vue'
import {
  createExplanationReview,
  explanationContentKey,
  explanationCriteria,
  type ExplanationCriterion,
  type ExplanationReport,
  type ExplanationReview,
} from './explanationReview'
const props = defineProps<{
  modelValue: ExplanationReview | null
  report: ExplanationReport
  available: boolean
  showExamples: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: ExplanationReview | null] }>()
const contentKey = computed(() => explanationContentKey(props.report))
const stale = computed(() => !!props.modelValue && props.modelValue.contentKey !== contentKey.value)
const reviewed = computed(() =>
  props.modelValue
    ? explanationCriteria.filter(
        (criterion) => props.modelValue!.criteria[criterion.id].verdict !== 'not-reviewed',
      ).length
    : 0,
)
function updateCriterion(id: ExplanationCriterion, field: 'verdict' | 'note', value: string) {
  if (!props.available || stale.value) return
  if (field === 'verdict' && !['not-reviewed', 'needs-work', 'supported'].includes(value)) return
  const review = props.modelValue ?? createExplanationReview(contentKey.value)
  emit('update:modelValue', {
    ...review,
    at: new Date().toISOString(),
    criteria: { ...review.criteria, [id]: { ...review.criteria[id], [field]: value } },
  })
}
function updateReview(field: 'source' | 'comment', value: string) {
  if (!props.available || stale.value) return
  if (field === 'source' && !['self', 'mentor'].includes(value)) return
  const review = props.modelValue ?? createExplanationReview(contentKey.value)
  emit('update:modelValue', { ...review, at: new Date().toISOString(), [field]: value })
}
</script>
<template>
  <details class="explanation-review">
    <summary>Разбор объяснения по рубрике · {{ reviewed }}/5 критериев</summary>
    <p>
      Сопоставьте отчёт с пятью критериями и запишите, на что опирается каждая отметка. Это
      отдельный ручной разбор; баллы лаборатории оценивают условия модели.
    </p>
    <p v-if="!available">
      Отметки доступны после завершения попытки. Сейчас можно использовать вопросы как план отчёта.
    </p>
    <p v-if="stale" role="status" class="terminal-hint">
      Текст или ссылки отчёта изменились после разбора. Пересмотрите критерии для новой редакции.
    </p>
    <button
      v-if="stale && available"
      class="button secondary"
      @click="emit('update:modelValue', createExplanationReview(contentKey, modelValue?.source))"
    >
      Начать повторный разбор с пустыми отметками
    </button>
    <p v-if="modelValue">
      Вручную разобрано {{ reviewed }} из 5 критериев ·
      {{ modelValue.source === 'self' ? 'самооценка' : 'отметки наставника'
      }}{{ stale ? ' · предыдущая редакция' : '' }}
    </p>
    <fieldset :disabled="!available || stale">
      <legend>Источник ручных отметок</legend>
      <label
        >Кто разбирает объяснение<AppSelect
          :model-value="modelValue?.source ?? 'self'"
          :disabled="!available || stale"
          class="text-input"
          @update:model-value="updateReview('source', $event)"
          ><AppSelectOption value="self">Самооценка ученика</AppSelectOption
          ><AppSelectOption value="mentor">Наставник на этом устройстве</AppSelectOption></AppSelect
        ></label
      >
    </fieldset>
    <div class="explanation-criteria">
      <article v-for="criterion in explanationCriteria" :key="criterion.id">
        <h4>{{ criterion.title }}</h4>
        <p>{{ criterion.question }}</p>
        <p class="muted">{{ criterion.example }}</p>
        <fieldset :disabled="!available || stale">
          <legend>{{ criterion.title }}: ручная отметка</legend>
          <label
            >Результат разбора<AppSelect
              :model-value="modelValue?.criteria[criterion.id].verdict ?? 'not-reviewed'"
              :disabled="!available || stale"
              class="text-input"
              @update:model-value="updateCriterion(criterion.id, 'verdict', $event)"
              ><AppSelectOption value="not-reviewed">Пока не разобрано</AppSelectOption
              ><AppSelectOption value="needs-work">Нужно доработать</AppSelectOption
              ><AppSelectOption value="supported"
                >Есть обоснование в отчёте</AppSelectOption
              ></AppSelect
            ></label
          >
          <label
            >На что опирается отметка или что улучшить<textarea
              :value="modelValue?.criteria[criterion.id].note ?? ''"
              class="text-input"
              rows="2"
              maxlength="600"
              @input="
                updateCriterion(criterion.id, 'note', ($event.target as HTMLTextAreaElement).value)
              "
            />
          </label>
        </fieldset>
      </article>
    </div>
    <label
      >Комментарий к объяснению<textarea
        :value="modelValue?.comment ?? ''"
        class="text-input"
        rows="3"
        maxlength="1200"
        :disabled="!available || stale"
        placeholder="Какой вывод стоит уточнить и какой будет следующий шаг?"
        @input="updateReview('comment', ($event.target as HTMLTextAreaElement).value)"
      />
    </label>
    <p>
      Отметки и комментарий сохраняются вместе с отчётом или черновиком по кнопке ниже. Авторство
      наставника здесь не проверяется.
    </p>
    <details v-if="showExamples">
      <summary>Сравнить два объяснения одного DNS-инцидента</summary>
      <p>
        Пример относится к вымышленному случаю с неверным DNS-сервером; у вашей лаборатории может
        быть другая причина.
      </p>
      <div class="explanation-examples">
        <article>
          <h4>Объяснение, которому не хватает доказательств</h4>
          <p>
            Интернет не работал. Почистил DNS и перезапустил сеть. Ping пошёл, значит всё
            исправлено.
          </p>
          <p>
            Не указан масштаб, нет проверки гипотезы, изменено несколько вещей сразу. Успешный ping
            не подтверждает работу целевого приложения. Следующий шаг отсутствует.
          </p>
        </article>
        <article>
          <h4>Обоснованное объяснение с границами</h4>
          <p>
            На одном учебном ПК не проходит TCP-подключение к portal.lab.example:443 по имени, но по
            IP оно доступно. Настроенный DNS не возвращает запись; прямой запрос к DNS из плана
            возвращает адрес портала. Это поддерживает гипотезу неверного DNS на клиенте, а не
            отказа TCP-службы.
          </p>
          <p>
            Изменил только DNS этого адаптера. После изменения повторил подключение по имени: TCP
            443 доступен в текущем состоянии. HTTP, TLS и вход пользователя этим не проверены.
            Следующий шаг — проверка приложения; при новом отказе сравню результаты и рассмотрю
            откат с передачей собранных данных.
          </p>
        </article>
      </div>
    </details>
  </details>
</template>
