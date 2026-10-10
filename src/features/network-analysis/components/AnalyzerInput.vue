<script setup lang="ts">
import AppSelect from '../../../shared/components/AppSelect.vue'
import AppSelectOption from '../../../shared/components/AppSelectOption.vue'
import { onBeforeUnmount, ref, watch } from 'vue'
import { FileUp, Play, Trash2, Terminal, FlaskConical, Copy, Check, WrapText } from '@lucide/vue'
import { useAnalysisStore } from '../model/useAnalysisStore'
import { outputExamples as examples } from '../../../fixtures'
import { readTextFile } from '../../../infrastructure/files/readTextFile'
import type { FileEncoding } from '../../../infrastructure/files/readTextFile'

const store = useAnalysisStore()
const tab = ref<'text' | 'file'>('text')
const encoding = ref<FileEncoding>('utf-8')
const file = ref<File>()
const fileInput = ref<HTMLInputElement>()
const fileError = ref('')
const exampleId = ref('')
const copied = ref(false)
const wrap = ref(false)
const reading = ref(false)
let readVersion = 0
onBeforeUnmount(() => readVersion++)
function replaceInput(text: string, source?: string) {
  readVersion++
  reading.value = false
  fileError.value = ''
  exampleId.value = ''
  store.setInput(text, source)
}
function moveTab(event: KeyboardEvent, next: 'text' | 'file') {
  tab.value = next
  const target = event.currentTarget as HTMLElement
  const sibling = next === 'file' ? target.nextElementSibling : target.previousElementSibling
  if (sibling instanceof HTMLElement) sibling.focus()
}
watch(
  () => store.generation,
  () => {
    readVersion++
    file.value = undefined
    fileError.value = ''
    exampleId.value = ''
    reading.value = false
    if (fileInput.value) fileInput.value.value = ''
  },
)
async function loadFile() {
  if (!file.value) return
  const version = ++readVersion
  reading.value = true
  fileError.value = ''
  try {
    const text = await readTextFile(file.value, encoding.value)
    if (version === readVersion) {
      exampleId.value = ''
      store.setInput(text, 'Локальный файл')
    }
  } catch (error: unknown) {
    if (version === readVersion)
      fileError.value = error instanceof Error ? error.message : 'Не удалось прочитать файл.'
  } finally {
    if (version === readVersion) reading.value = false
  }
}
function selectFile(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0]
  void loadFile()
}
function selectExample(value: string) {
  const example = examples.find((e) => e.id === value)
  if (example) {
    replaceInput(example.text, `Пример: ${example.name}`)
    exampleId.value = value
    store.mode = 'auto'
    tab.value = 'text'
  }
}
async function copyCommand() {
  try {
    await navigator.clipboard.writeText('ipconfig /all')
    copied.value = true
    setTimeout(() => (copied.value = false), 1600)
  } catch {
    fileError.value = 'Команда для ручного копирования: ipconfig /all'
  }
}
</script>

<template>
  <section class="panel input-panel">
    <div class="panel-heading">
      <div>
        <Terminal :size="18" />
        <h2>Исходный вывод</h2>
      </div>
      <span class="tag">CMD · WINDOWS</span>
    </div>
    <div class="input-tabs" role="tablist" aria-label="Способ ввода">
      <button
        id="tab-text"
        role="tab"
        :aria-selected="tab === 'text'"
        aria-controls="input-text-panel"
        :tabindex="tab === 'text' ? 0 : -1"
        :class="{ selected: tab === 'text' }"
        @click="tab = 'text'"
        @keydown.right.prevent="moveTab($event, 'file')"
      >
        <Terminal :size="15" /> Вставить текст</button
      ><button
        id="tab-file"
        role="tab"
        :aria-selected="tab === 'file'"
        aria-controls="input-file-panel"
        :tabindex="tab === 'file' ? 0 : -1"
        :class="{ selected: tab === 'file' }"
        @click="tab = 'file'"
        @keydown.left.prevent="moveTab($event, 'text')"
      >
        <FileUp :size="15" /> Выбрать файл
      </button>
    </div>
    <div
      v-if="tab === 'file'"
      id="input-file-panel"
      role="tabpanel"
      aria-labelledby="tab-file"
      class="file-panel"
    >
      <FileUp :size="28" /><strong>Откройте текстовый файл</strong>
      <p>.txt, .log или .json · до 2 MiB<br />Файл читается только в этом браузере.</p>
      <label class="button secondary file-label"
        >Выбрать файл<input
          ref="fileInput"
          type="file"
          accept=".txt,.log,.json"
          aria-label="Выбрать локальный файл"
          @change="selectFile" /></label
      ><label class="encoding-label"
        >Кодировка<AppSelect v-model="encoding" @change="loadFile">
          <AppSelectOption value="utf-8">UTF-8</AppSelectOption>
          <AppSelectOption value="windows-1251">Windows-1251</AppSelectOption>
          <AppSelectOption value="ibm866">CP866 (CMD)</AppSelectOption>
        </AppSelect></label
      ><span v-if="reading" role="status">Чтение локального файла…</span>
    </div>
    <div v-show="tab === 'text'" id="input-text-panel" role="tabpanel" aria-labelledby="tab-text">
      <div class="editor-toolbar">
        <span><span class="status-dot" /> {{ store.source }}</span
        ><button
          class="icon-button small"
          :aria-pressed="wrap"
          aria-label="Переносить длинные строки"
          @click="wrap = !wrap"
        >
          <WrapText :size="16" />
        </button>
      </div>
      <label class="sr-only" for="command-output">Вывод команды</label
      ><textarea
        id="command-output"
        :value="store.input"
        :wrap="wrap ? 'soft' : 'off'"
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
        placeholder="Windows IP Configuration&#10;&#10;Ethernet adapter Ethernet:&#10;   IPv4 Address . . . :&#10;   Subnet Mask . . . :&#10;   Default Gateway . :&#10;&#10;Вставьте сюда полный вывод ipconfig /all…"
        @input="replaceInput(($event.target as HTMLTextAreaElement).value)"
        @keydown.ctrl.enter.prevent="store.analyze()"
        @keydown.meta.enter.prevent="store.analyze()"
      />
      <div class="editor-footer">
        <span>{{ store.input ? store.input.split('\n').length : 0 }} строк</span
        ><span>Ctrl / ⌘ + Enter</span>
      </div>
    </div>
    <p v-if="fileError" class="form-error" role="alert">{{ fileError }}</p>
    <div class="input-options">
      <label
        >Формат<AppSelect v-model="store.mode" aria-label="Формат">
          <AppSelectOption value="auto">Определить автоматически</AppSelectOption>
          <AppSelectOption value="ipconfig">ipconfig /all (RU / EN)</AppSelectOption>
          <AppSelectOption value="ping">ping</AppSelectOption>
          <AppSelectOption value="nslookup">nslookup</AppSelectOption>
          <AppSelectOption value="tracert">tracert</AppSelectOption>
          <AppSelectOption value="route">route print</AppSelectOption>
          <AppSelectOption value="dns-records"
            >DNS MX/TXT/SRV · Resolve-DnsName JSON</AppSelectOption
          >
          <AppSelectOption value="powershell"
            >PowerShell JSON · TCP / IP-конфигурация</AppSelectOption
          >
        </AppSelect></label
      ><label
        ><span><FlaskConical :size="13" /> Демопример</span
        ><AppSelect v-model="exampleId" aria-label="Демопример" @change="selectExample">
          <AppSelectOption value="">Выбрать пример…</AppSelectOption>
          <AppSelectOption v-for="example in examples" :key="example.id" :value="example.id">
            {{ example.name }}
          </AppSelectOption>
        </AppSelect></label
      >
    </div>
    <div class="input-actions">
      <button class="button primary" :disabled="store.busy || reading" @click="store.analyze()">
        <Play :size="15" /> {{ store.busy ? 'Обработка текста…' : 'Проанализировать' }}</button
      ><button class="button ghost" @click="store.clear()">
        <Trash2 :size="15" /> Очистить всё
      </button>
    </div>
    <div class="command-tip">
      <span>Команда только для чтения</span
      ><button @click="copyCommand">
        <code>ipconfig /all</code><Check v-if="copied" :size="14" /><Copy v-else :size="14" />
      </button>
    </div>
  </section>
</template>
