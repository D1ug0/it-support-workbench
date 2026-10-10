<script setup lang="ts">
import { onMounted, ref } from 'vue'
const registration = ref<ServiceWorkerRegistration>()
const busy = ref(false)
const status = ref('')
const error = ref(''),
  version = ref('')
const available = !import.meta.env.DEV && 'serviceWorker' in navigator && globalThis.isSecureContext
const scope = new URL('./', document.baseURI).href
const script = new URL('sw.js', scope).href
function owned(value: ServiceWorkerRegistration) {
  return (
    value.scope === scope &&
    [value.active, value.waiting, value.installing].some((worker) => worker?.scriptURL === script)
  )
}
async function refresh() {
  if (!available) return
  const reg = await navigator.serviceWorker.getRegistration(scope)
  registration.value = reg && owned(reg) ? reg : undefined
  readVersion()
}
function readVersion() {
  const worker = registration.value?.active
  if (!worker) return
  const channel = new window.MessageChannel()
  const timer = globalThis.setTimeout(() => {
    channel.port1.close()
    channel.port2.close()
  }, 3000)
  channel.port1.onmessage = (event) => {
    if (typeof event.data?.version === 'string' && /^[a-f0-9]{16}$/.test(event.data.version))
      version.value = event.data.version
    globalThis.clearTimeout(timer)
    channel.port1.close()
    channel.port2.close()
  }
  worker.postMessage({ type: 'GET_VERSION' }, [channel.port2])
}
async function waitForActivation(reg: ServiceWorkerRegistration) {
  if (reg.active?.state === 'activated') return
  const worker = reg.installing ?? reg.waiting ?? reg.active
  if (!worker) throw new Error('Не удалось начать установку офлайн-файлов.')
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Установка офлайн-файлов не завершилась. Проверьте сеть и повторите.'))
    }, 20_000)
    function cleanup() {
      globalThis.clearTimeout(timeout)
      worker!.removeEventListener('statechange', check)
    }
    function check() {
      if (worker!.state === 'activated') {
        cleanup()
        resolve()
      } else if (worker!.state === 'redundant') {
        cleanup()
        reject(new Error('Не удалось загрузить полный набор офлайн-файлов.'))
      }
    }
    worker.addEventListener('statechange', check)
    check()
  })
}
onMounted(
  () =>
    void refresh().catch(() => {
      error.value = 'Не удалось прочитать состояние офлайн-доступа.'
    }),
)
async function enable() {
  busy.value = true
  error.value = ''
  try {
    const previous = await navigator.serviceWorker.getRegistration(scope)
    if (previous && !owned(previous))
      throw new Error(
        'Этот путь уже обслуживается другим Service Worker. Выберите отдельный путь размещения.',
      )
    const reg = await navigator.serviceWorker.register(script, { scope, updateViaCache: 'none' })
    await waitForActivation(reg)
    registration.value = reg
    readVersion()
    status.value =
      'Офлайн-доступ включён. Файлы приложения сохранены; пользовательские логи не кешируются.'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось включить офлайн-доступ.'
  } finally {
    busy.value = false
  }
}
async function disable() {
  busy.value = true
  error.value = ''
  try {
    if (registration.value) await registration.value.unregister()
    const prefix = 'it-workbench-static:' + encodeURIComponent(scope) + ':'
    for (const key of await caches.keys()) if (key.startsWith(prefix)) await caches.delete(key)
    registration.value = undefined
    version.value = ''
    status.value =
      'Регистрация и кэш приложения удалены. Закройте вкладки приложения, чтобы прекратить управление текущей страницей.'
  } catch {
    error.value = 'Не удалось полностью удалить офлайн-кэш.'
  } finally {
    busy.value = false
  }
}
async function update() {
  busy.value = true
  error.value = ''
  try {
    await registration.value?.update()
    status.value = registration.value?.waiting
      ? 'Новая версия подготовлена. Сохраните работу и закройте все вкладки приложения; новое открытие применит обновление.'
      : 'Проверка обновления завершена. Новая версия может загружаться; сохраните работу и закройте вкладки перед обновлением.'
  } catch {
    error.value = 'Проверка обновлений недоступна. Возможно, нет соединения.'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <section class="panel feature-section">
    <h2>Офлайн-доступ к приложению</h2>
    <p>
      Включается по вашему выбору. Кэш содержит только production HTML, JavaScript, CSS, иконки и
      manifest. Диагностические источники, отчёты, API и произвольные файлы в кэш не записываются.
    </p>
    <p v-if="!available">
      Доступно для production build через HTTPS или localhost. Используйте npm run build и npm run
      preview. В dev-режиме кэш выключен.
    </p>
    <div v-else class="button-row">
      <button v-if="!registration" class="button primary small" :disabled="busy" @click="enable">
        Включить офлайн-доступ</button
      ><template v-else
        ><span class="tag">ОФЛАЙН-ДОСТУП ВКЛЮЧЁН</span
        ><button class="button secondary small" :disabled="busy" @click="update">
          Проверить обновления</button
        ><button class="button ghost small" :disabled="busy" @click="disable">
          Отключить офлайн-доступ
        </button></template
      >
    </div>
    <p v-if="version">
      Версия активного офлайн-пакета: <code>{{ version }}</code>
    </p>
    <p v-if="status" role="status">{{ status }}</p>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p>
      Новая версия не перезагружает страницу автоматически и ждёт закрытия открытых вкладок. Первое
      включение требует сети. Установка отдельного окна зависит от возможностей браузера.
    </p>
    <a
      href="https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers"
      target="_blank"
      rel="noopener noreferrer"
      >MDN · жизненный цикл Service Worker</a
    >
  </section>
</template>
