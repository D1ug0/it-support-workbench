<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { downloadText } from '../../infrastructure/export/exportReport'
import { cleanTerminalText, CommandLine } from './commandLine'
import AppSelect from '../../shared/components/AppSelect.vue'
import AppSelectOption from '../../shared/components/AppSelectOption.vue'
import '@xterm/xterm/css/xterm.css'
const props = defineProps<{
  commands?: string[]
  history?: string[]
  resetKey: number
  disabled: boolean
  platform?: 'Windows' | 'Linux'
}>()
const emit = defineEmits<{ command: [value: string] }>()
const container = ref<HTMLElement>(),
  plainInput = ref<HTMLInputElement>()
const simple = ref(false)
const fontSize = ref('14')
const editor = reactive(new CommandLine())
const promptText = computed(() => (props.platform === 'Linux' ? 'student@lab:~$ ' : 'PS C:\\Lab> '))
const banner = 'Учебный терминал. Введите help для списка команд.\n'
const transcript = ref(banner),
  status = ref(''),
  rendererError = ref('')
const suggestions = ref<string[]>([]),
  historyQuery = ref('')
const visibleHistory = computed(() =>
  [...new Set([...editor.history].reverse())].filter((command) =>
    command.toLowerCase().includes(historyQuery.value.toLowerCase()),
  ),
)
let terminal: Terminal | undefined, fit: FitAddon | undefined
let observer: InstanceType<typeof window.ResizeObserver> | undefined,
  themeObserver: InstanceType<typeof window.MutationObserver> | undefined
let frame = 0
function theme() {
  if (!terminal) return
  const css = window.getComputedStyle(document.documentElement)
  terminal.options.theme = {
    background: css.getPropertyValue('--surface').trim(),
    foreground: css.getPropertyValue('--text').trim(),
    cursor: css.getPropertyValue('--accent').trim(),
    selectionBackground: css.getPropertyValue('--accent-dim').trim(),
  }
}
function repaint() {
  if (terminal) {
    // Keep editing on one terminal row even when a command is wider than the console.
    const width = Math.max(1, terminal.cols - promptText.value.length - 3)
    const start = Math.max(0, editor.caret - width + 1)
    const visible = editor.line.slice(start, start + width)
    const right = start + width < editor.line.length ? '›' : ''
    const tail = visible.length - (editor.caret - start) + right.length
    terminal.write(
      `\r\x1b[2K${promptText.value}${start ? '‹' : ''}${visible}${right}${tail > 0 ? `\x1b[${tail}D` : ''}`,
    )
  }
  if (simple.value)
    void nextTick(() => plainInput.value?.setSelectionRange(editor.caret, editor.caret))
}
function fitConsole() {
  if (!terminal || !fit || simple.value) return
  const current = terminal,
    addon = fit
  // Erase the input before reflow, then redraw it at the new width.
  current.write('\r\x1b[2K', () => {
    if (terminal !== current || simple.value) return
    addon.fit()
    repaint()
  })
}
function submit() {
  if (props.disabled) return
  const command = editor.submit()
  if (!command) return
  suggestions.value = []
  terminal?.write(`\r\x1b[2K${promptText.value}${command}\r\n`)
  transcript.value = (transcript.value + `${promptText.value}${command}\n`).slice(-60000)
  emit('command', command)
}
function output(value: string, clear = false) {
  if (clear) {
    terminal?.clear()
    transcript.value = ''
  }
  const safe = cleanTerminalText(value)
  transcript.value = (transcript.value + `${safe}\n`).slice(-60000)
  terminal?.write(`${safe.replace(/\r?\n/g, '\r\n')}\r\n${promptText.value}`)
  status.value = `Команда завершена. ${safe.slice(0, 150)}`
}
function clearView() {
  terminal?.clear()
  terminal?.write('\x1b[2J\x1b[H')
  transcript.value = banner
  repaint()
  status.value = 'Экран очищен. История команд и состояние лаборатории сохранены.'
}
function reset() {
  editor.reset(props.history)
  suggestions.value = []
  historyQuery.value = ''
  status.value = ''
  transcript.value = banner
  terminal?.reset()
  terminal?.write(`${banner.replace(/\n/g, '\r\n')}${promptText.value}`)
}
function focusCommand(value: string) {
  if (props.disabled) return
  editor.edit(value)
  suggestions.value = []
  repaint()
  void nextTick(() => {
    if (simple.value) plainInput.value?.focus()
    else terminal?.focus()
  })
}
function complete() {
  const matches = editor.complete(props.commands ?? ['help', 'cls'])
  suggestions.value = matches.length > 1 ? matches : []
  status.value = matches.length
    ? `Найдено форм команды: ${matches.length}. Enter выполняет команду; кнопка только вставляет её.`
    : 'Поддерживаемых форм с таким началом нет. Откройте справочник команд.'
  repaint()
}
function moveHistory(direction: -1 | 1) {
  editor.previous(direction)
  suggestions.value = []
  repaint()
}
function searchHistory() {
  status.value = editor.search() ? `Поиск по истории: ${editor.line}` : 'Совпадений в истории нет.'
  repaint()
}
function editPlain(event: Event) {
  const input = event.target as HTMLInputElement
  editor.edit(input.value, input.selectionStart ?? input.value.length)
  suggestions.value = []
}
function syncCaret(event: Event) {
  const input = event.target as HTMLInputElement
  editor.caret = input.selectionStart ?? editor.line.length
}
function plainKey(event: KeyboardEvent) {
  if (event.isComposing || props.disabled) return
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault()
    moveHistory(event.key === 'ArrowUp' ? -1 : 1)
  } else if (event.key === 'Tab' && !event.shiftKey) {
    if (
      (props.commands ?? ['help', 'cls']).some((command) =>
        command.toLowerCase().startsWith(editor.line.toLowerCase()),
      )
    ) {
      event.preventDefault()
      complete()
    }
  } else if (event.ctrlKey && event.key.toLowerCase() === 'r') {
    event.preventDefault()
    searchHistory()
  } else if (event.key === 'Escape') suggestions.value = []
}
defineExpose({ output, focusCommand })
watch(() => props.resetKey, reset)
watch(
  () => props.disabled,
  (value) => {
    if (terminal) terminal.options.disableStdin = value
  },
)
watch(simple, () => {
  window.cancelAnimationFrame(frame)
  frame = window.requestAnimationFrame(() => {
    if (!simple.value) {
      fitConsole()
    }
  })
})
watch(fontSize, (value) => {
  if (terminal) terminal.options.fontSize = Number(value)
  window.cancelAnimationFrame(frame)
  frame = window.requestAnimationFrame(() => {
    fitConsole()
  })
})
onMounted(() => {
  if (!container.value) return
  try {
    terminal = new Terminal({
      cursorBlink: true,
      fontSize: Number(fontSize.value),
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      scrollback: 500,
      screenReaderMode: true,
      disableStdin: props.disabled,
      linkHandler: {
        activate() {
          /* Links in command output are inert. */
        },
      },
    })
    fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(container.value)
    terminal.textarea?.setAttribute(
      'aria-label',
      'Командная строка учебного терминала. Shift+Tab возвращает к элементам страницы.',
    )
    terminal.attachCustomKeyEventHandler((event) => {
      // Shift+Tab keeps an accessible path out of the terminal.
      if (event.key === 'Tab' && event.shiftKey) return false
      if (event.type === 'keydown' && event.key === 'Tab' && !props.disabled) {
        event.preventDefault()
        complete()
        return false
      }
      return true
    })
    theme()
    fit.fit()
    reset()
    terminal.onData((data) => {
      if (props.disabled) return
      if (data !== '\t' && data !== '\x12') suggestions.value = []
      if (data === '\r') submit()
      else if (data === '\x7f') {
        editor.remove(true)
        repaint()
      } else if (data === '\x1b[3~') {
        editor.remove(false)
        repaint()
      } else if (data === '\x1b[D' || data === '\x1b[C') {
        editor.move(data === '\x1b[D' ? -1 : 1)
        repaint()
      } else if (['\x1b[H', '\x1b[1~', '\x01'].includes(data)) {
        editor.caret = 0
        repaint()
      } else if (['\x1b[F', '\x1b[4~', '\x05'].includes(data)) {
        editor.caret = editor.line.length
        repaint()
      } else if (data === '\x12') searchHistory()
      else if (data === '\x03') {
        terminal?.write('^C\r\n')
        editor.clear()
        repaint()
      } else if (data === '\x1b[A' || data === '\x1b[B') moveHistory(data === '\x1b[A' ? -1 : 1)
      else if (data === '\t') complete()
      else if (!data.includes('\x1b')) {
        editor.insert(data)
        repaint()
      }
    })
    observer = new window.ResizeObserver(() => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        fitConsole()
      })
    })
    observer.observe(container.value)
    themeObserver = new window.MutationObserver(theme)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
  } catch {
    observer?.disconnect()
    themeObserver?.disconnect()
    terminal?.dispose()
    terminal = undefined
    fit = undefined
    editor.reset(props.history)
    simple.value = true
    rendererError.value =
      'Графический терминал недоступен. Учебные команды работают через простой ввод.'
  }
})
onBeforeUnmount(() => {
  window.cancelAnimationFrame(frame)
  observer?.disconnect()
  themeObserver?.disconnect()
  terminal?.dispose()
  terminal = undefined
  fit = undefined
})
</script>
<template>
  <section class="panel terminal-console" aria-label="Учебная консоль">
    <p v-if="rendererError" role="status">{{ rendererError }}</p>
    <div class="button-row">
      <strong>Виртуальный {{ platform ?? 'Windows' }} · {{ promptText }}</strong>
      <label class="checkbox-label"
        ><input v-model="simple" type="checkbox" :disabled="Boolean(rendererError)" />Простой ввод и
        текстовый вывод</label
      >
    </div>
    <p>
      Синтетическая среда. Команды выполняются в модели. ↑/↓ — история с возвратом к черновику, Tab
      — дополнение, Ctrl+R — поиск по истории. Shift+Tab — вернуться к элементам страницы.
    </p>
    <label class="terminal-font-size"
      >Размер текста<AppSelect v-model="fontSize" class="text-input"
        ><AppSelectOption value="12">12 px</AppSelectOption
        ><AppSelectOption value="14">14 px</AppSelectOption
        ><AppSelectOption value="16">16 px</AppSelectOption
        ><AppSelectOption value="18">18 px</AppSelectOption
        ><AppSelectOption value="20">20 px</AppSelectOption></AppSelect
      ></label
    >
    <div v-show="!simple" ref="container" class="xterm-container" aria-label="Терминал xterm.js" />
    <template v-if="simple">
      <pre
        class="terminal-transcript"
        :style="{ fontSize: `${fontSize}px` }"
        tabindex="0"
        aria-label="Вывод учебного терминала"
        >{{ transcript }}</pre>
      <form class="terminal-command-form" @submit.prevent="submit">
        <label for="terminal-command">Команда учебного терминала</label>
        <input
          id="terminal-command"
          ref="plainInput"
          :value="editor.line"
          class="text-input"
          autocomplete="off"
          spellcheck="false"
          maxlength="512"
          :disabled="disabled"
          @input="editPlain"
          @keydown="plainKey"
          @keyup="syncCaret"
          @click="syncCaret"
          @select="syncCaret"
        />
        <button class="button primary" :disabled="disabled || !editor.line.trim()">
          Выполнить в учебной среде
        </button>
      </form>
    </template>
    <div
      v-if="suggestions.length"
      class="terminal-suggestions"
      aria-label="Варианты дополнения команды"
    >
      <p>Совпадений: {{ suggestions.length }}. Выберите форму и проверьте параметры.</p>
      <button
        v-for="command in suggestions.slice(0, 8)"
        :key="command"
        class="button ghost"
        :disabled="disabled"
        @click="focusCommand(command)"
      >
        <code>{{ command }}</code>
      </button>
      <p v-if="suggestions.length > 8">
        Для остальных форм уточните начало команды или откройте справочник.
      </p>
      <button class="button ghost" @click="suggestions = []">Закрыть варианты</button>
    </div>
    <div class="button-row terminal-console-actions">
      <button class="button ghost" @click="clearView">Очистить экран</button>
      <button class="button ghost" @click="downloadText(transcript, 'workbench-terminal.txt')">
        Скачать вывод TXT
      </button>
    </div>
    <details v-if="editor.history.length" class="terminal-history">
      <summary>История этой попытки · {{ editor.history.length }} команд</summary>
      <label
        >Найти в истории<input
          v-model="historyQuery"
          class="text-input"
          type="search"
          maxlength="512"
      /></label>
      <ul>
        <li v-for="command in visibleHistory" :key="command">
          <button class="button ghost" :disabled="disabled" @click="focusCommand(command)">
            <code>{{ command }}</code>
          </button>
        </li>
      </ul>
      <p v-if="!visibleHistory.length">Совпадений нет.</p>
      <p>Кнопка вставляет команду для редактирования. История хранится в памяти текущей попытки.</p>
    </details>
    <p class="sr-only" role="status">{{ status }}</p>
  </section>
</template>
