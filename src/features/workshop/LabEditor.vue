<script setup lang="ts">
import AppSelect from '../../shared/components/AppSelect.vue'
import AppSelectOption from '../../shared/components/AppSelectOption.vue'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { extendedLabs } from '../terminal/labDefinitions'
import { topologySchema, parseLabPackage, type LabDefinition } from '../terminal/networkModel'
import { useWorkshopStore } from './useWorkshopStore'
import { useTerminalStore } from '../terminal/useTerminalStore'
import { downloadText } from '../../infrastructure/export/exportReport'
const store = useWorkshopStore(),
  terminal = useTerminalStore(),
  router = useRouter()
const draft = ref<LabDefinition>({
  ...globalThis.structuredClone(extendedLabs[0]!),
  id: `USR-${globalThis.crypto.randomUUID()}`,
})
const consent = ref(false),
  error = ref(''),
  notice = ref(''),
  busy = ref(false),
  pending = ref<LabDefinition[]>()
const template = ref(extendedLabs[0]!.id)
const valid = computed(() => topologySchema.safeParse(draft.value))
function reset() {
  const source = extendedLabs.find((l) => l.id === template.value)!
  draft.value = {
    ...globalThis.structuredClone(source),
    id: `USR-${globalThis.crypto.randomUUID()}`,
  }
  consent.value = false
  error.value = ''
}
function addHost() {
  const hosts = draft.value.additionalHosts ?? []
  let index = 1
  while (hosts.some((h) => h.id === `host-${index}`)) index++
  draft.value.additionalHosts = [
    ...hosts,
    {
      id: `host-${index}`,
      title: `Учебный сервер ${index}`,
      role: 'server',
      address: `198.51.100.${20 + index}`,
      name: `host${index}.lab.example`,
      fault: 'service',
    },
  ]
}
function play(lab: LabDefinition) {
  terminal.start(lab.id, 'guided', topologySchema.parse(lab))
  void router.push('/terminal')
}
function exportLab(lab = draft.value) {
  downloadText(
    JSON.stringify({ schemaVersion: 1, labs: [topologySchema.parse(lab)] }, null, 2),
    'workbench-labs.json',
    'application/json;charset=utf-8',
  )
}
async function save(values: LabDefinition[]) {
  if (!consent.value) {
    error.value = 'Подтвердите, что пакет содержит только учебные данные.'
    return
  }
  busy.value = true
  try {
    await store.saveLabs(values)
    pending.value = undefined
    notice.value = 'Лаборатории сохранены.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Ошибка сохранения.'
  } finally {
    busy.value = false
  }
}
let version = 0
onBeforeUnmount(() => version++)
async function read(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  if (!file) return
  const read = ++version
  try {
    if (file.size > 262144) throw new Error('Лимит: 256 KiB.')
    const values = parseLabPackage(await file.text())
    if (read === version) pending.value = values
  } catch (e) {
    if (read === version) error.value = e instanceof Error ? e.message : 'Ошибка пакета.'
  } finally {
    input.value = ''
  }
}
async function remove(id: string) {
  try {
    await store.removeLab(id)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Удаление не удалось.'
  }
}
</script>
<template>
  <section class="panel feature-section">
    <h2>Редактор терминальных лабораторий</h2>
    <p>
      Выберите проверенный шаблон неисправности и измените учебное условие. Цель — сбор evidence,
      исправление состояния, проверка сервиса и объяснение. Программный код в пакетах не
      выполняется.
    </p>
    <label
      >Шаблон<AppSelect v-model="template" class="text-input" @change="reset">
        <AppSelectOption v-for="lab in extendedLabs" :key="lab.id" :value="lab.id">{{
          lab.title
        }}</AppSelectOption>
      </AppSelect></label
    >
    <div class="form-grid">
      <label
        >Название лаборатории<input v-model="draft.title" class="text-input" maxlength="160"
      /></label>
      <label>Адрес клиента<input v-model="draft.client" class="text-input" /></label>
      <label
        >Префикс<input
          v-model.number="draft.prefix"
          class="text-input"
          type="number"
          min="8"
          max="30"
      /></label>
      <label>Шлюз<input v-model="draft.gateway" class="text-input" /></label>
      <label>DNS-сервер<input v-model="draft.dns" class="text-input" /></label>
      <label>Адрес сервера<input v-model="draft.server" class="text-input" /></label>
      <label>Имя портала<input v-model="draft.target" class="text-input" /></label>
    </div>
    <label
      >Условие<textarea v-model="draft.brief" class="text-input" rows="3" maxlength="2000" />
    </label>
    <label
      >Правильное объяснение<textarea
        v-model="draft.explanation"
        class="text-input"
        rows="3"
        maxlength="2000"
      />
    </label>
    <label v-for="(_, i) in draft.hints" :key="i"
      >Подсказка {{ i + 1 }}<input v-model="draft.hints[i]" class="text-input" maxlength="500"
    /></label>
    <fieldset>
      <legend>Объяснения причины</legend>
      <label v-for="(_, i) in draft.causes" :key="i"
        >Вариант {{ i + 1
        }}<input v-model="draft.causes[i]" class="text-input" maxlength="160" /></label
      ><label
        >Правильный вариант<AppSelect v-model="draft.correctCause" class="text-input">
          <AppSelectOption v-for="(_, i) in draft.causes" :key="i" :value="i">{{
            i + 1
          }}</AppSelectOption>
        </AppSelect></label
      >
    </fieldset>
    <details>
      <summary>
        Дополнительные клиенты и серверы ({{ draft.additionalHosts?.length ?? 0 }}/6)
      </summary>
      <p>
        Клиенты используют общий план подсети. DNS клиента, состояние узла, служба и HTTP серверов
        проверяются отдельно. Для итогового решения нужна lab verify-fleet.
      </p>
      <fieldset v-for="(h, i) in draft.additionalHosts" :key="h.id">
        <legend>{{ h.id }}</legend>
        <label
          >Название узла {{ i + 1
          }}<input v-model="h.title" class="text-input" maxlength="160" /></label
        ><label
          >Роль узла {{ i + 1
          }}<AppSelect v-model="h.role" class="text-input" @change="h.fault = 'none'">
            <AppSelectOption value="client">Клиент</AppSelectOption>
            <AppSelectOption value="server">Сервер</AppSelectOption>
          </AppSelect></label
        ><label>Адрес узла {{ i + 1 }}<input v-model="h.address" class="text-input" /></label
        ><label>Имя узла {{ i + 1 }}<input v-model="h.name" class="text-input" /></label
        ><label
          >Неисправность узла {{ i + 1
          }}<AppSelect v-model="h.fault" class="text-input">
            <AppSelectOption value="none">Исправен</AppSelectOption>
            <AppSelectOption value="offline">Узел недоступен</AppSelectOption>
            <AppSelectOption v-if="h.role === 'client'" value="dns">Неверный DNS</AppSelectOption>
            <template v-else
              ><AppSelectOption value="service">Остановлена служба</AppSelectOption>
              <AppSelectOption value="http">HTTP 503</AppSelectOption></template
            >
          </AppSelect></label
        ><button class="button ghost small" @click="draft.additionalHosts?.splice(i, 1)">
          Удалить узел {{ i + 1 }}
        </button>
      </fieldset>
      <button
        class="button secondary small"
        :disabled="(draft.additionalHosts?.length ?? 0) >= 6"
        @click="addHost"
      >
        Добавить узел лаборатории
      </button>
    </details>
    <p>
      После изменения адресов обновите команды в подсказках. Разрешены документационные IPv4-сети и
      имена *.lab.example. Научную корректность авторского текста проверяет автор.
    </p>
    <p v-if="!valid.success" role="status">{{ valid.error.issues[0]?.message }}</p>
    <label class="checkbox-label"
      ><input v-model="consent" type="checkbox" />В пакете только вымышленные учебные данные;
      сохранить явно</label
    >
    <div class="button-row">
      <button class="button primary" :disabled="busy || !valid.success" @click="save([draft])">
        Сохранить лабораторию</button
      ><button class="button secondary" :disabled="!valid.success" @click="play(draft)">
        Проверить черновик в терминале</button
      ><button class="button ghost" :disabled="!valid.success" @click="exportLab()">
        Экспорт лаборатории JSON
      </button>
    </div>
    <label
      >Импорт пакета лабораторий<input type="file" accept=".json,application/json" @change="read"
    /></label>
    <div v-if="pending" class="terminal-checkpoint-preview">
      <p>
        Пакет: {{ pending.length }} лабораторий. {{ pending.map((l) => l.title).join('; ') }}.
        Совпадающие USR-ID будут обновлены.
      </p>
      <button class="button secondary" :disabled="busy" @click="save(pending)">
        Подтвердить импорт лабораторий</button
      ><button class="button ghost" @click="pending = undefined">Отменить импорт</button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <h3>Мои лаборатории ({{ store.customLabs.length }}/20)</h3>
    <div v-for="lab in store.customLabs" :key="lab.id" class="workshop-item">
      <strong>{{ lab.title }}</strong>
      <div class="button-row">
        <button class="button secondary" @click="play(lab)">Пройти</button
        ><button class="button ghost" @click="draft = topologySchema.parse(lab)">
          Редактировать</button
        ><button class="button ghost" @click="exportLab(lab)">Экспорт</button
        ><button class="button ghost" @click="remove(lab.id)">Удалить лабораторию</button>
      </div>
    </div>
  </section>
</template>
