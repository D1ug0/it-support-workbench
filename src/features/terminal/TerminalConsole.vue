<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { commandExamples } from './catalog'
const props = defineProps<{ resetKey: number; disabled: boolean }>()
const emit = defineEmits<{ command: [value: string] }>()
const container = ref<HTMLElement>()
const simple = ref(false)
const fallback = ref('')
const transcript = ref('Учебный терминал. Введите help для списка команд.\n')
const status = ref('')
const rendererError = ref('')
let terminal: Terminal | undefined, fit: FitAddon | undefined
let observer: InstanceType<typeof window.ResizeObserver> | undefined,
  themeObserver: InstanceType<typeof window.MutationObserver> | undefined
let line = '',
  history: string[] = [],
  position = 0
let frame = 0
const clean = (value: string) =>
  [...value]
    .filter(
      (c) =>
        [9, 10, 13].includes(c.charCodeAt(0)) ||
        (c.charCodeAt(0) >= 32 && (c.charCodeAt(0) < 127 || c.charCodeAt(0) > 159)),
    )
    .join('')
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
function prompt() {
  terminal?.write('PS C:\\Lab> ')
}
function repaint() {
  terminal?.write(`\r\x1b[2KPS C:\\Lab> ${line}`)
}
function replaceInput(value: string) {
  line = value.slice(0, 512)
  fallback.value = line
  repaint()
}
function submit(value = line) {
  if (props.disabled || !value.trim()) return
  // Never paste-and-run several lines. Enter submits one line only.
  const command = value.trim().slice(0, 512)
  history = [...history, command].slice(-50)
  position = history.length
  terminal?.write('\r\n')
  transcript.value += `PS C:\\Lab> ${command}\n`
  line = ''
  fallback.value = ''
  emit('command', command)
}
function output(value: string, clear = false) {
  if (clear) {
    terminal?.clear()
    transcript.value = ''
  }
  const safe = clean(value)
  transcript.value = (transcript.value + `${safe}\n`).slice(-60000)
  terminal?.write(`${safe.replace(/\r?\n/g, '\r\n')}\r\n`)
  status.value = `Команда завершена. ${safe.slice(0, 150)}`
  prompt()
}
function reset() {
  line = ''
  history = []
  position = 0
  fallback.value = ''
  status.value = ''
  transcript.value = 'Учебный терминал. Введите help для списка команд.\n'
  terminal?.reset()
  terminal?.writeln('Учебный терминал. Введите help для списка команд.')
  prompt()
}
function focusCommand(value: string) {
  replaceInput(value)
  if (simple.value) document.getElementById('terminal-command')?.focus()
  else terminal?.focus()
}
defineExpose({ output, focusCommand })
watch(() => props.resetKey, reset)
watch(
  () => props.disabled,
  (value) => {
    if (terminal) terminal.options.disableStdin = value
  },
)
watch(simple, () => window.requestAnimationFrame(() => fit?.fit()))
onMounted(() => {
  if (!container.value) return
  try {
    terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
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
    terminal.textarea?.setAttribute('aria-label', 'Командная строка учебного терминала')
    theme()
    fit.fit()
    reset()
    terminal.onData((data) => {
      if (props.disabled) return
      if (data === '\r') submit()
      else if (data === '\x7f') {
        line = line.slice(0, -1)
        fallback.value = line
        repaint()
      } else if (data === '\x03') {
        terminal?.writeln('^C')
        line = ''
        fallback.value = ''
        prompt()
      } else if (data === '\x1b[A' || data === '\x1b[B') {
        position = Math.min(history.length, Math.max(0, position + (data === '\x1b[A' ? -1 : 1)))
        replaceInput(history[position] ?? '')
      } else if (data === '\t') {
        const matches = ['help', 'cls', ...commandExamples.map(([c]) => c)].filter((c) =>
          c.toLowerCase().startsWith(line.toLowerCase()),
        )
        if (matches.length === 1) replaceInput(matches[0]!)
      } else if (!data.includes('\x1b')) {
        // Multi-line clipboard input becomes one editable line, never execution.
        replaceInput(line + clean(data).replace(/[\r\n\t]+/g, ' '))
      }
    })
    observer = new window.ResizeObserver(() => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        if (!simple.value) fit?.fit()
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
      <strong>Виртуальный Windows · PS C:\Lab&gt;</strong>
      <label class="checkbox-label"
        ><input v-model="simple" type="checkbox" :disabled="Boolean(rendererError)" />Простой ввод и
        текстовый вывод</label
      >
    </div>
    <p>
      Синтетическая среда. Команды не выполняются на вашем устройстве. ↑/↓ — история, Tab —
      дополнение, Ctrl+C — очистить ввод.
    </p>
    <div v-show="!simple" ref="container" class="xterm-container" aria-label="Терминал xterm.js" />
    <template v-if="simple">
      <pre class="terminal-transcript" tabindex="0" aria-label="Вывод учебного терминала">{{
        transcript
      }}</pre>
      <form class="terminal-command-form" @submit.prevent="submit(fallback)">
        <label for="terminal-command">Команда учебного терминала</label>
        <input
          id="terminal-command"
          v-model="fallback"
          class="text-input"
          autocomplete="off"
          spellcheck="false"
          maxlength="512"
          :disabled="disabled"
        />
        <button class="button primary" :disabled="disabled || !fallback.trim()">
          Выполнить в учебной среде
        </button>
      </form>
    </template>
    <p class="sr-only" role="status">{{ status }}</p>
  </section>
</template>
