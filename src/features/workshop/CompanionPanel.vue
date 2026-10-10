<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  CompanionClient,
  companionOrigins,
  defaultCompanionOrigin,
  type remoteProgressSchema,
} from './companion'
import type { z } from 'zod'
import { useWorkshopStore } from './useWorkshopStore'
import { workshopCourses } from './courses'
const store = useWorkshopStore()
const endpoint = ref(defaultCompanionOrigin),
  name = ref(''),
  password = ref(''),
  connected = ref(''),
  consent = ref(false),
  aiConsent = ref(false),
  aiConfigured = ref(false),
  busy = ref(false),
  error = ref(''),
  notice = ref(''),
  pending = ref<z.infer<typeof remoteProgressSchema>>(),
  question = ref(''),
  courseId = ref('DNS'),
  answer = ref(''),
  answerOrigin = ref(''),
  answerSource = ref('')
let client: CompanionClient | undefined,
  alive = true
const course = computed(() => workshopCourses.find((c) => c.id === courseId.value)!)
onBeforeUnmount(() => {
  alive = false
  client?.close()
  password.value = ''
})
async function action(fn: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await fn()
  } catch (e) {
    if (alive) error.value = e instanceof Error ? e.message : 'Сервис недоступен.'
  } finally {
    if (alive) busy.value = false
  }
}
async function login(register = false) {
  await action(async () => {
    if (!consent.value) throw new Error('Подтвердите подключение к выбранному сервису.')
    disconnect()
    client = new CompanionClient(endpoint.value)
    const health = await client.health()
    const user = await client.login(name.value, password.value, register)
    if (alive) {
      connected.value = user
      aiConfigured.value = health.aiConfigured
      password.value = ''
      pending.value = undefined
      notice.value = 'Вход выполнен. Прогресс ещё не отправлялся.'
    }
  })
}
async function read() {
  await action(async () => {
    const remote = await client!.read()
    if (alive) {
      pending.value = remote
      notice.value = 'Получена версия с сервиса. Выберите загрузку или отправку после сравнения.'
    }
  })
}
async function upload() {
  await action(async () => {
    if (!pending.value) throw new Error('Сначала прочитайте ревизию сервиса.')
    const result = await client!.write(store.state, pending.value.revision)
    if (alive) {
      pending.value = { schemaVersion: 1, revision: result.revision, state: store.state }
      notice.value =
        'Отправлен только прогресс практикума. Отчёты, логи и лаборатории не отправлялись.'
    }
  })
}
async function restore() {
  await action(async () => {
    if (pending.value) {
      await store.replace(pending.value.state)
      notice.value = 'Локальный прогресс заменён просмотренной версией сервиса.'
    }
  })
}
function disconnect() {
  connected.value = ''
  pending.value = undefined
  aiConfigured.value = false
  client?.close()
  client = undefined
}
async function logout() {
  await action(async () => {
    try {
      await client!.logout()
    } finally {
      if (alive) disconnect()
    }
  })
}
async function remove() {
  await action(async () => {
    await client!.deleteAccount()
    if (alive) {
      disconnect()
      notice.value = 'Учётная запись и серверный прогресс удалены. Локальные данные сохранены.'
    }
  })
}
function explainLocal() {
  answer.value = [...course.value.paragraphs, 'Следующие проверки:', ...course.value.steps].join(
    '\n\n',
  )
  answerOrigin.value = 'Локальные проверяемые материалы'
  answerSource.value = course.value.source
}
async function explainExternal() {
  await action(async () => {
    if (!aiConsent.value) throw new Error('Подтвердите передачу вопроса провайдеру.')
    const result = await client!.explain(courseId.value, question.value, true)
    if (alive) {
      answer.value = result.text
      answerSource.value = result.source
      answerOrigin.value =
        'Внешний AI: объяснение может содержать ошибки; оценка лаборатории не меняется.'
    }
  })
}
</script>
<template>
  <section class="panel feature-section">
    <h3>Опциональный сервис синхронизации</h3>
    <p>
      Основное приложение работает без сервера. Для своего companion запустите
      <code>npm run companion</code>. Подключение и отправка выполняются по кнопкам; токен и пароль
      не сохраняются в браузере.
    </p>
    <p>
      Адреса сервиса для этой сборки: {{ companionOrigins.join(', ') }}. Собственный HTTPS origin
      задаёт владелец через <code>VITE_COMPANION_ORIGIN</code> при сборке.
    </p>
    <label
      >Адрес вашего сервиса<input
        v-model="endpoint"
        class="text-input"
        :disabled="Boolean(connected)" /></label
    ><label class="checkbox-label"
      ><input v-model="consent" type="checkbox" />Подключиться к указанному мной сервису и передать
      учётные данные при входе</label
    >
    <template v-if="!connected"
      ><label
        >Имя учебной учётной записи<input
          v-model="name"
          class="text-input"
          autocomplete="username"
          maxlength="40" /></label
      ><label
        >Пароль (от 10 символов)<input
          v-model="password"
          type="password"
          class="text-input"
          autocomplete="current-password"
          maxlength="128"
      /></label>
      <div class="button-row">
        <button class="button secondary" :disabled="busy || !consent" @click="login(false)">
          Войти в companion</button
        ><button class="button ghost" :disabled="busy || !consent" @click="login(true)">
          Создать учебную учётную запись
        </button>
      </div></template
    >
    <template v-else
      ><p>Подключено: {{ connected }}</p>
      <div class="button-row">
        <button class="button secondary" :disabled="busy" @click="read">
          Прочитать прогресс с сервиса</button
        ><button class="button ghost" :disabled="busy" @click="logout">Выйти из companion</button>
      </div>
      <div v-if="pending" class="terminal-checkpoint-preview">
        <p>
          Сервис: ревизия {{ pending.revision }}, {{ pending.state.attempts.length }} попыток. На
          устройстве: {{ store.state.attempts.length }} попыток. Загрузка заменяет местную версию;
          отправка заменяет серверную при совпадении ревизии.
        </p>
        <details>
          <summary>Сравнить содержимое прогресса</summary>
          <pre class="workshop-report-preview" tabindex="0">
СЕРВИС: {{ JSON.stringify(pending.state, null, 2) }}
УСТРОЙСТВО: {{ JSON.stringify(store.state, null, 2) }}</pre>
        </details>
        <div class="button-row">
          <button class="button secondary" :disabled="busy" @click="restore">
            Заменить локальный прогресс версией сервиса</button
          ><button class="button ghost" :disabled="busy" @click="upload">
            Отправить локальный прогресс в сервис
          </button>
        </div>
      </div>
      <details>
        <summary>Удалить серверную учётную запись</summary>
        <p>
          Будут удалены учётная запись, сеансы и прогресс на выбранном сервисе. Локальные данные
          останутся.
        </p>
        <button class="button ghost" :disabled="busy" @click="remove">
          Подтвердить удаление серверной учётной записи
        </button>
      </details></template
    >
    <h3>Учебный помощник</h3>
    <label
      >Тема объяснения<select v-model="courseId" class="text-input">
        <option v-for="c in workshopCourses" :key="c.id" :value="c.id">{{ c.title }}</option>
      </select></label
    ><button class="button secondary" @click="explainLocal">
      Объяснить по локальным материалам
    </button>
    <details>
      <summary>Внешний AI через ваш companion</summary>
      <p>
        Доступен после настройки владельцем <code>OPENAI_API_KEY</code> и
        <code>WORKBENCH_AI_MODEL</code>. Ключ хранится на сервере. Лимит — 10 запросов в час на
        учётную запись; модель и расходы выбирает владелец. Сейчас:
        {{ connected && aiConfigured ? 'настроен' : 'не подключён или не настроен' }}.
      </p>
      <label
        >Учебный вопрос<textarea v-model="question" class="text-input" maxlength="1200" rows="3" />
      </label>
      <details>
        <summary>Предпросмотр передачи провайдеру</summary>
        <pre class="workshop-report-preview" tabindex="0">{{
          JSON.stringify({ question, material: course.paragraphs, steps: course.steps }, null, 2)
        }}</pre>
      </details>
      <label class="checkbox-label"
        ><input v-model="aiConsent" type="checkbox" />Передать этот вопрос и открытые учебные
        материалы внешнему AI; проверил отсутствие чувствительных данных</label
      ><button
        class="button secondary"
        :disabled="busy || !connected || !aiConfigured || !aiConsent || question.trim().length < 3"
        @click="explainExternal"
      >
        Запросить внешнее объяснение
      </button>
    </details>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <section v-if="answer">
      <p>{{ answerOrigin }}</p>
      <pre class="workshop-report-preview" tabindex="0">{{ answer }}</pre>
      <a :href="answerSource" target="_blank" rel="noopener noreferrer">Материал по теме</a>
    </section>
  </section>
</template>
