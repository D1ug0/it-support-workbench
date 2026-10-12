<script setup lang="ts">
import { workshopCourses } from '../../domain/courses'
import { standTasks, standMarkdown } from '../../domain/stand'
import { downloadText } from '../../../../infrastructure/export/exportReport'
import { formatDifference } from '../../../sessions/session'
import AppSelect from '../../../../shared/components/AppSelect.vue'
import AppSelectOption from '../../../../shared/components/AppSelectOption.vue'
import { useStandSession } from '../../model/useStandSession'
const {
  taskId,
  task,
  own,
  isolated,
  snapshot,
  consent,
  busy,
  error,
  notice,
  notes,
  draftId,
  savedDrafts,
  saved,
  revealed,
  captures,
  captureNotice,
  differences,
  changeTask,
  clearCaptures,
  save,
  exportDraft,
  exportNotes,
  read,
  remove,
  saveNotes,
  resumeDraft,
  resumeReport,
} = useStandSession()
</script>
<template>
  <section class="workshop-item">
    <h4>Пошаговая практика на своей ОС</h4>
    <p>
      Выполняйте команды вручную в собственном стенде. Здесь отмечаются шаги и ваши выводы;
      результат не повышает оценку самостоятельного владения в симуляторе.
    </p>
    <label
      >Задание настоящего стенда<AppSelect
        v-model="taskId"
        class="text-input"
        @change="changeTask()"
      >
        <AppSelectOption v-for="t in standTasks" :key="t.id" :value="t.id">{{
          t.title
        }}</AppSelectOption>
      </AppSelect></label
    >
    <label
      >Продолжить черновик стенда<AppSelect class="text-input" @change="resumeDraft($event)">
        <AppSelectOption value="">Выберите черновик</AppSelectOption>
        <AppSelectOption v-for="d in savedDrafts" :key="d.id" :value="d.id">
          {{ d.taskId }} · {{ d.at }}
        </AppSelectOption>
      </AppSelect></label
    >
    <p>{{ task.objective }} · {{ task.platform }}</p>
    <RouterLink
      class="text-link"
      :to="`/learning?view=workshop&lesson=${workshopCourses.find((c) => c.skill === task.skill)?.id ?? 'ADDRESS'}`"
      >Повторить материал перед заданием</RouterLink
    >
    <label class="checkbox-label"
      ><input v-model="own" type="checkbox" />Работаю в собственном разрешённом учебном
      окружении</label
    >
    <label class="checkbox-label"
      ><input v-model="isolated" type="checkbox" />Учебное окружение изолировано от рабочих
      систем</label
    >
    <label class="checkbox-label"
      ><input v-model="snapshot" type="checkbox" />Подготовил снимок или копию и способ
      восстановления</label
    >
    <p>
      В командах замените прописные обозначения своими учебными значениями. Автоматического
      выполнения нет.
    </p>
    <pre v-if="task.commands.length" class="workshop-report-preview" tabindex="0">{{
      task.commands.join('\n')
    }}</pre>
    <fieldset>
      <legend>Шаги задания</legend>
      <label v-for="(step, i) in task.steps" :key="step" class="checkbox-label"
        ><input v-model="notes.completedSteps" type="checkbox" :value="i" />{{ step }}</label
      >
    </fieldset>
    <details>
      <summary>Сравнить обезличенный вывод до и после в памяти</summary>
      <p>
        Поддерживаются форматы анализатора. Linux journal, Git и другие произвольные логи описывайте
        вручную. Значения при сравнении скрыты; raw не сохраняется.
      </p>
      <label
        >Учебный вывод до<input
          type="file"
          accept=".txt,.json,text/plain,application/json"
          @change="read($event, 'before')" /></label
      ><label
        >Учебный вывод после<input
          type="file"
          accept=".txt,.json,text/plain,application/json"
          @change="read($event, 'after')"
      /></label>
      <p role="status">{{ captureNotice }}</p>
      <ul>
        <li v-for="(d, i) in differences" :key="i">
          {{ d.scope }} · {{ d.field }}: {{ formatDifference(d.before) }} →
          {{ formatDifference(d.after) }}
        </li>
      </ul>
      <p v-if="captures.before && captures.after && !differences.length">
        Различий в поддерживаемых полях не найдено.
      </p>
      <button class="button ghost" @click="clearCaptures">Очистить учебные выводы</button>
    </details>
    <label
      >ОС, версия и локаль стенда<input v-model="notes.platform" class="text-input" maxlength="160"
    /></label>
    <label
      >Симптом стенда<textarea v-model="notes.symptom" class="text-input" maxlength="1200" /></label
    ><label
      >Гипотеза стенда<textarea
        v-model="notes.hypothesis"
        class="text-input"
        maxlength="1200"
      /></label
    ><label
      >Изменение на стенде<textarea
        v-model="notes.change"
        class="text-input"
        maxlength="1200"
      /></label
    ><label
      >Повторная проверка на стенде<textarea
        v-model="notes.verification"
        class="text-input"
        maxlength="1200"
      />
    </label>
    <p>{{ task.question }}</p>
    <label
      >Самостоятельное объяснение<textarea
        v-model="notes.answer"
        class="text-input"
        maxlength="1800"
      />
    </label>
    <label class="checkbox-label"
      ><input v-model="consent" type="checkbox" />Проверил отчёт стенда: только обезличенные учебные
      заметки</label
    >
    <div class="button-row">
      <button class="button secondary" :disabled="!consent || busy" @click="saveNotes">
        Сохранить черновик стенда
      </button>
      <button class="button secondary" :disabled="!consent" @click="exportNotes">
        Экспорт учебных заметок JSON
      </button>
      <button
        class="button primary"
        :disabled="busy || !own || !isolated || !snapshot || !consent"
        @click="save"
      >
        Сохранить отчёт стенда</button
      ><button class="button secondary" :disabled="!consent" @click="exportDraft">
        Скачать черновик отчёта стенда
      </button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <button v-if="error" class="button secondary" @click="resumeDraft(draftId)">
      Перечитать сохранённый черновик стенда
    </button>
    <button v-if="error" class="button secondary" @click="resumeReport(draftId)">
      Перечитать сохранённый отчёт стенда
    </button>
    <p v-if="notice" role="status">{{ notice }}</p>
    <details>
      <summary @click="revealed = true">Отчёты стенда ({{ saved.length }}/50)</summary>
      <template v-if="revealed"
        ><article v-for="a in saved" :key="a.id" class="workshop-item">
          <h5>{{ standTasks.find((t) => t.id === a.taskId)?.title }} · {{ a.at }}</h5>
          <pre class="workshop-report-preview" tabindex="0">{{ standMarkdown(a) }}</pre>
          <button class="button secondary" @click="resumeReport(a.id)">
            Продолжить отчёт стенда
          </button>
          <button
            class="button secondary"
            @click="downloadText(standMarkdown(a), 'workbench-stand-report.md')"
          >
            Экспорт отчёта стенда</button
          ><button class="button ghost" @click="remove(a.id)">Удалить отчёт стенда</button>
        </article></template
      >
    </details>
  </section>
</template>
