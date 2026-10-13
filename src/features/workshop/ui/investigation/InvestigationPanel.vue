<script setup lang="ts">
import { downloadText } from '../../../../infrastructure/export/exportReport'
import AppSelect from '../../../../shared/components/AppSelect.vue'
import AppSelectOption from '../../../../shared/components/AppSelectOption.vue'
import ExplanationReviewPanel from './ExplanationReviewPanel.vue'
import ReportRevisionHistory from './ReportRevisionHistory.vue'
import { useInvestigationSession } from '../../model/useInvestigationSession'
const {
  terminal,
  workshop,
  symptom,
  hypothesis,
  evidence,
  change,
  verification,
  limits,
  consent,
  error,
  notice,
  busy,
  reportId,
  reportTitle,
  reportLabId,
  reportAttemptId,
  status,
  explanationReview,
  inheritedRefs,
  sameReference,
  toggleReference,
  savedDrafts,
  report,
  reviewAvailable,
  previewText,
  save,
  saveNotes,
  resumeDraft,
  editReport,
} = useInvestigationSession()
</script>
<template>
  <section class="panel feature-section">
    <h2>Оформить расследование</h2>
    <p>{{ reportTitle }} · {{ reportLabId }}</p>
    <p>
      Запишите свои выводы. Заметки остаются в памяти до явного сохранения. Свободный текст
      автоматически не обезличивается; перед экспортом проверьте содержимое.
    </p>
    <label
      >Статус отчёта<AppSelect v-model="status" class="text-input">
        <AppSelectOption value="draft">Черновик</AppSelectOption>
        <AppSelectOption value="completed">Законченный отчёт</AppSelectOption>
      </AppSelect></label
    >
    <label
      >Продолжить сохранённый черновик<AppSelect class="text-input" @change="resumeDraft($event)">
        <AppSelectOption value="">Выберите черновик</AppSelectOption>
        <AppSelectOption
          v-for="d in savedDrafts.filter((d) => d.taskId === terminal.lab.id)"
          :key="d.id"
          :value="d.id"
        >
          {{ d.at }} · {{ d.attemptId }}
        </AppSelectOption>
      </AppSelect></label
    >
    <label
      >Редактировать отчёт этой лаборатории<AppSelect
        class="text-input"
        @change="editReport($event)"
      >
        <AppSelectOption value="">Выберите отчёт</AppSelectOption>
        <AppSelectOption
          v-for="r in workshop.portfolio.filter((r) => r.labId === terminal.lab.id)"
          :key="r.id"
          :value="r.id"
        >
          {{ r.title }} · версия {{ r.version }}
        </AppSelectOption>
      </AppSelect></label
    >
    <fieldset v-if="terminal.records.length && reportAttemptId === terminal.attemptId">
      <legend>Добавить ссылки на синтетические доказательства</legend>
      <label v-for="r in terminal.records" :key="r.id" class="checkbox-label">
        <input
          type="checkbox"
          :checked="inheritedRefs.some((reference) => sameReference(reference, r))"
          :disabled="
            report.evidenceRefs.length >= 40 &&
            !inheritedRefs.some((reference) => sameReference(reference, r))
          "
          @change="toggleReference(r, ($event.target as HTMLInputElement).checked)"
        />
        #{{ r.id }} · ревизия {{ r.revision }} · {{ r.command }}
      </label>
      <p>
        Выбрано {{ report.evidenceRefs.length }} из 40 ссылок. Прежние ссылки можно убрать отдельно.
      </p>
    </fieldset>
    <div v-if="inheritedRefs.length">
      <h3>Проверки, связанные с отчётом</h3>
      <p>
        Ссылки описывают синтетические команды; исходный вывод хранится только в памяти попытки.
      </p>
      <ul>
        <li
          v-for="(reference, index) in inheritedRefs"
          :key="reference.recordId ?? `${reference.commandId}-${index}`"
        >
          #{{ reference.commandId }} · состояние {{ reference.revision }} ·
          <code>{{ reference.command }}</code
          ><button
            class="button ghost"
            @click="inheritedRefs = inheritedRefs.filter((_, itemIndex) => itemIndex !== index)"
          >
            Убрать ссылку #{{ reference.commandId }}
          </button>
        </li>
      </ul>
    </div>
    <label
      >Симптом и масштаб<textarea
        v-model="symptom"
        class="text-input"
        rows="2"
        maxlength="1200"
        placeholder="Кто затронут и какое действие не проходит?"
      /></label
    ><label
      >Гипотеза<textarea
        v-model="hypothesis"
        class="text-input"
        rows="2"
        maxlength="1200"
        placeholder="Предполагаемая причина и альтернативное объяснение"
      /></label
    ><label
      >Доказательства<textarea
        v-model="evidence"
        class="text-input"
        rows="3"
        maxlength="1800"
      /></label
    ><label
      >Что изменено<textarea v-model="change" class="text-input" rows="2" maxlength="1200" /></label
    ><label
      >Повторная проверка<textarea
        v-model="verification"
        class="text-input"
        rows="2"
        maxlength="1200"
      />
    </label>
    <label
      >Ограничения, откат и эскалация<textarea
        v-model="limits"
        class="text-input"
        rows="3"
        maxlength="1200"
        placeholder="Что ещё не проверено? Когда нужен откат или передача задачи?"
      />
    </label>
    <ExplanationReviewPanel
      v-model="explanationReview"
      :report="report"
      :available="reviewAvailable"
      :show-examples="reviewAvailable"
    />
    <ReportRevisionHistory
      :history="workshop.portfolio.find((value) => value.id === reportId)?.reportHistory"
    />
    <details>
      <summary>Предпросмотр учебного отчёта</summary>
      <pre class="workshop-report-preview" tabindex="0">{{ previewText }}</pre>
    </details>
    <label class="checkbox-label"
      ><input v-model="consent" type="checkbox" />Проверил заметки: здесь только учебные
      данные</label
    >
    <div class="button-row">
      <button class="button secondary" :disabled="!consent || busy" @click="saveNotes">
        Сохранить учебный черновик
      </button>
      <button class="button secondary" :disabled="!consent || busy" @click="save">
        Сохранить в портфолио</button
      ><button
        class="button ghost"
        :disabled="!consent"
        @click="downloadText(previewText, 'workbench-investigation.md')"
      >
        Экспорт расследования Markdown
      </button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <button v-if="error" class="button secondary" @click="resumeDraft(reportId)">
      Перечитать сохранённый черновик
    </button>
    <p v-if="notice" role="status">{{ notice }}</p>
    <details v-if="terminal.environment.network">
      <summary>Временная линия лаборатории</summary>
      <ol class="trace-timeline">
        <li v-for="(event, index) in terminal.environment.network.timeline" :key="index">
          T+{{ event.time }} с · {{ event.type }} · {{ event.message }}
        </li>
      </ol>
    </details>
    <div v-if="terminal.environment.network">
      <p>
        Разбор изменений модели: улучшений {{ terminal.environment.network.changeAudit.repairs }},
        ухудшений {{ terminal.environment.network.changeAudit.regressions }}, без улучшения
        {{ terminal.environment.network.changeAudit.unnecessary }}, откатов
        {{ terminal.environment.network.changeAudit.rollbacks }}.
      </p>
      <p>
        Дополнительный отказ снижает оценку на 5, изменение без улучшения — на 2; вместе не больше
        20 баллов. Это оценка условий модели. Откат возвращает настройку, сохраняет разбор и требует
        новой проверки сервиса. Последние 20 изменений доступны только в текущей попытке.
      </p>
      <button
        class="button secondary"
        :disabled="
          terminal.finished ||
          !terminal.rollbackStates.length ||
          terminal.environment.network.revision >= 1000
        "
        @click="terminal.undo()"
      >
        Откатить последнее изменение модели
      </button>
    </div>
  </section>
</template>
