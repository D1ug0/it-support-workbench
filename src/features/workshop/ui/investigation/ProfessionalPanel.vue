<script setup lang="ts">
import { downloadText } from '../../../../infrastructure/export/exportReport'
import {
  professionalMarkdown,
  professionalCases,
  faultTitles,
} from '../../domain/professional/index'
import AppSelect from '../../../../shared/components/AppSelect.vue'
import AppSelectOption from '../../../../shared/components/AppSelectOption.vue'
import HypothesisTable from './HypothesisTable.vue'
import ExplanationReviewPanel from './ExplanationReviewPanel.vue'
import ReportRevisionHistory from './ReportRevisionHistory.vue'
import { useProfessionalSession } from '../../model/useProfessionalSession'
const {
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
} = useProfessionalSession()
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
    <fieldset :disabled="busy || attempt.status === 'abandoned'">
      <legend>Отчёт расследования · можно уточнять после завершения</legend>
      <fieldset :disabled="attempt.status !== 'active'">
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
      <fieldset :disabled="attempt.status !== 'active'">
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
    <label
      >Ограничения и следующий шаг<textarea
        v-model="attempt.reportLimits"
        class="text-input"
        maxlength="1200"
        :disabled="busy"
        placeholder="Что ещё не проверено? Когда нужен откат или передача задачи?"
      />
    </label>
    <ExplanationReviewPanel
      :model-value="attempt.explanationReview ?? null"
      :report="explanationReport"
      :available="attempt.status === 'completed' && !busy"
      :show-examples="attempt.status === 'completed'"
      @update:model-value="attempt.explanationReview = $event"
    />
    <ReportRevisionHistory :history="attempt.reportHistory" />
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
