<script setup lang="ts">
import AppSelect from '../shared/components/AppSelect.vue'
import AppSelectOption from '../shared/components/AppSelectOption.vue'
import { computed, ref } from 'vue'
import { useSessionStore } from '../features/sessions/useSessionStore'
import { compareOutputs, formatDifference, exportSession } from '../features/sessions/session'
import { createAddressRedactor } from '../infrastructure/export/redact'
import { downloadText } from '../infrastructure/export/exportReport'
import EvidenceViewer from '../features/network-analysis/components/EvidenceViewer.vue'
import type { EvidenceRange } from '../domain/types/diagnostic'
import SessionArchivePanel from '../features/sessions/SessionArchivePanel.vue'
const session = useSessionStore()
const name = ref('')
const device = ref('')
const confirmed = ref(false)
const error = ref('')
const beforeId = ref('')
const afterId = ref('')
const sourceId = ref('')
const range = ref<EvidenceRange>()
const preview = ref('')
const revealed = ref(false)
const before = computed(() => session.records.find((r) => r.id === beforeId.value))
const after = computed(() => session.records.find((r) => r.id === afterId.value))
const source = computed(() => session.records.find((r) => r.id === sourceId.value))
const comparable = computed(() =>
  Boolean(
    before.value &&
    after.value &&
    beforeId.value !== afterId.value &&
    before.value.analysis.parse.kind === after.value.analysis.parse.kind &&
    (before.value.analysis.parse.value?.kind !== 'powershell' ||
      after.value.analysis.parse.value?.kind !== 'powershell' ||
      before.value.analysis.parse.value.cmdlet === after.value.analysis.parse.value.cmdlet),
  ),
)
const differences = computed(() =>
  comparable.value && before.value?.analysis.parse.value && after.value?.analysis.parse.value
    ? compareOutputs(before.value.analysis.parse.value, after.value.analysis.parse.value)
    : [],
)
const redactor = computed(() => {
  void differences.value
  return createAddressRedactor()
})
function start() {
  try {
    session.start(name.value, device.value, confirmed.value)
    error.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось создать сессию.'
  }
}
function clear() {
  if (!window.confirm('Очистить сессию и все её источники из памяти вкладки?')) return
  session.clear()
  beforeId.value = ''
  afterId.value = ''
  sourceId.value = ''
  preview.value = ''
}
function showSource(id: string, selected?: EvidenceRange) {
  sourceId.value = id
  range.value = selected
}
function prepareReport() {
  preview.value = exportSession(
    session.records,
    session.observations,
    differences.value,
    comparable.value ? { beforeId: beforeId.value, afterId: afterId.value } : undefined,
  )
}
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">CONNECTED EVIDENCE</span>
      <h1>Одна задача. Полная картина<span class="accent">.</span></h1>
      <p>Сопоставьте команды одного устройства, время проверок и изменения конфигурации.</p>
    </div>
    <span class="tag">ПАМЯТЬ + АРХИВ ПО ЗАПРОСУ</span>
  </div>
  <form v-if="!session.active" class="panel feature-section" @submit.prevent="start">
    <h2>Создать рабочую сессию</h2>
    <div class="form-grid">
      <label
        >Название сессии<input
          v-model="name"
          class="text-input"
          maxlength="100"
          placeholder="Диагностика доступа через VPN" /></label
      ><label
        >Контекст устройства<input
          v-model="device"
          class="text-input"
          maxlength="100"
          required
          placeholder="Учебный ПК A, один инцидент"
      /></label>
    </div>
    <label class="checkbox-label"
      ><input v-model="confirmed" type="checkbox" /> Подтверждаю, что добавлю проверки одного
      устройства и согласованного контекста</label
    >
    <p>
      Имена и названия не входят в обезличенный экспорт. Исходники сессии не сохраняются
      автоматически.
    </p>
    <button class="button primary">Создать сессию</button>
    <p v-if="error" role="alert" class="form-error">{{ error }}</p>
  </form>
  <template v-else>
    <section class="panel feature-section">
      <div class="section-heading">
        <div>
          <h2>{{ session.title }}</h2>
          <p>{{ session.context }} · {{ session.records.length }} / 20 проверок</p>
        </div>
        <div class="button-row">
          <RouterLink v-if="!session.restored" class="button primary small" to="/analyzer"
            >Добавить вывод</RouterLink
          ><button
            class="button secondary small"
            :disabled="!session.records.length"
            @click="prepareReport"
          >
            Отчёт сессии</button
          ><button class="button ghost small" @click="clear">Очистить сессию</button>
        </div>
      </div>
      <p v-if="!session.restored">
        В анализаторе разберите команду и раскройте «Добавить эту проверку в рабочую сессию».
        Перезагрузка очищает сессию. Очистка анализатора не удаляет добавленные сюда проверки.
      </p>
      <p v-else role="status">
        Восстановлена обезличенная модель. Источники и исходные наблюдения исключены; можно
        сравнивать поддерживаемые поля и формировать отчёт. Для новой диагностики очистите сессию.
      </p>
    </section>
    <div class="session-records">
      <article
        v-for="(record, index) in session.records"
        :key="record.id"
        class="panel feature-section"
      >
        <span class="tag">{{ record.analysis.parse.kind }} · {{ index + 1 }}</span>
        <h2>{{ record.label }}</h2>
        <p>
          {{ new Date(record.observedAt).toLocaleString('ru-RU') }} ·
          {{ record.analysis.parse.status }}
        </p>
        <div class="button-row">
          <button
            class="button secondary small"
            :disabled="!record.source"
            @click="showSource(record.id)"
          >
            Открыть источник</button
          ><button class="button ghost small" @click="session.remove(record.id)">
            Удалить проверку
          </button>
        </div>
      </article>
    </div>
    <section v-if="session.records.length" class="panel feature-section">
      <h2>Связи между проверками</h2>
      <p v-if="!session.observations.length">
        Пока нет подходящих пар для сопоставления DNS и ICMP. Добавьте ipconfig, nslookup и ping в
        этой сессии.
      </p>
      <article v-for="item in session.observations" :key="item.id" class="session-observation">
        <span class="tag">{{ item.id }}</span>
        <h3>{{ item.title }}</h3>
        <p>{{ item.explanation }}</p>
        <p class="finding-limit">{{ item.limitation }}</p>
        <div class="button-row">
          <button
            v-for="(reference, index) in item.references"
            :key="reference.recordId"
            :disabled="!session.records.find((r) => r.id === reference.recordId)?.source"
            class="button secondary small"
            @click="showSource(reference.recordId, reference.range)"
          >
            Источник {{ index + 1 }}
          </button>
        </div>
      </article>
    </section>
    <section v-if="session.records.length > 1" class="panel feature-section">
      <h2>Изменения до / после</h2>
      <div class="form-grid">
        <label
          >До<AppSelect v-model="beforeId" class="text-input" aria-label="До">
            <AppSelectOption value="">Выберите проверку</AppSelectOption>
            <AppSelectOption v-for="record in session.records" :key="record.id" :value="record.id">
              {{ record.label }} · {{ record.analysis.parse.kind }}
            </AppSelectOption>
          </AppSelect></label
        ><label
          >После<AppSelect v-model="afterId" class="text-input" aria-label="После">
            <AppSelectOption value="">Выберите проверку</AppSelectOption>
            <AppSelectOption v-for="record in session.records" :key="record.id" :value="record.id">
              {{ record.label }} · {{ record.analysis.parse.kind }}
            </AppSelectOption>
          </AppSelect></label
        >
      </div>
      <p>
        Сравниваются два вывода одной команды. Интерфейсы сопоставляются по уникальному имени;
        переименование и дубликаты требуют ручной проверки. Порядок DNS и строк сам по себе не
        считается изменением.
      </p>
      <p v-if="beforeId && afterId && !comparable" role="status">
        Выберите разные проверки одного формата.
      </p>
      <template v-if="comparable"
        ><p
          v-if="before && after && Date.parse(before.observedAt) > Date.parse(after.observedAt)"
          class="form-error"
        >
          Время «до» позже времени «после». Проверьте выбранный порядок.
        </p>
        <label class="checkbox-label"
          ><input v-model="revealed" type="checkbox" /> Показать адреса в сравнении</label
        >
        <p v-if="!differences.length" role="status">
          Различий в поддерживаемых полях не найдено. Неполный вывод не доказывает неизменность всей
          конфигурации.
        </p>
        <div class="diff-list">
          <article v-for="(item, index) in differences" :key="index" class="session-observation">
            <span class="tag">{{ revealed ? item.scope : `Контекст ${index + 1}` }}</span>
            <h3>{{ item.field }}</h3>
            <div class="comparison-columns">
              <div>
                <span>До</span><code>{{ formatDifference(item.before, redactor, revealed) }}</code>
              </div>
              <div>
                <span>После</span
                ><code>{{ formatDifference(item.after, redactor, revealed) }}</code>
              </div>
            </div>
          </article>
        </div></template
      >
    </section>
    <EvidenceViewer v-if="source?.source" :key="source.id" :text="source.source" :range="range" />
    <section v-if="preview" class="panel feature-section">
      <h2>Предпросмотр обезличенной сессии</h2>
      <p>Названия, контекст и исходники исключены. Проверьте отчёт перед передачей.</p>
      <pre tabindex="0" class="text-preview" role="region" aria-label="Отчёт рабочей сессии">{{
        preview
      }}</pre>
      <div class="button-row">
        <button class="button primary small" @click="downloadText(preview, 'workbench-session.md')">
          Скачать сессию Markdown</button
        ><button class="button ghost small" @click="preview = ''">Закрыть отчёт сессии</button>
      </div>
    </section>
  </template>
  <SessionArchivePanel />
</template>
