import { calculateSubnet, isIPv4 } from '../../domain/network'

type Field = 'network' | 'broadcast' | 'mask' | 'hosts'
export const subnetExercises: ReadonlyArray<{
  id: string
  address: string
  prefix: number
  field: Field
}> = [
  { id: 'network-25', address: '192.0.2.130', prefix: 25, field: 'network' },
  { id: 'broadcast-26', address: '198.51.100.77', prefix: 26, field: 'broadcast' },
  { id: 'hosts-30', address: '203.0.113.4', prefix: 30, field: 'hosts' },
  { id: 'mask-24', address: '192.0.2.10', prefix: 24, field: 'mask' },
  { id: 'network-28', address: '198.51.100.55', prefix: 28, field: 'network' },
  { id: 'hosts-31', address: '198.51.100.0', prefix: 31, field: 'hosts' },
  { id: 'hosts-32', address: '203.0.113.9', prefix: 32, field: 'hosts' },
  { id: 'broadcast-29', address: '192.0.2.99', prefix: 29, field: 'broadcast' },
]
const labels: Record<Field, string> = {
  network: 'Адрес сети',
  broadcast: 'Broadcast-адрес',
  mask: 'Маска подсети',
  hosts: 'Количество доступных адресов',
}
export function getSubnetExercise(id: string) {
  const definition = subnetExercises.find((exercise) => exercise.id === id)
  if (!definition) throw new Error('Неизвестное задание по подсетям.')
  const subnet = calculateSubnet(definition.address, definition.prefix)
  const expected = String(subnet[definition.field])
  const rule =
    definition.prefix === 31
      ? 'Для соединения point-to-point /31 по RFC 3021 доступны оба адреса; обычного broadcast нет.'
      : definition.prefix === 32
        ? 'Префикс /32 обозначает один адрес, отдельные адреса сети и broadcast не резервируются.'
        : `Размер блока: 2^(32 − ${definition.prefix}) = ${subnet.size}. Адреса сети и broadcast исключаются из адресов узлов.`
  return {
    ...definition,
    label: labels[definition.field],
    expected,
    explanation: `${rule} Сеть: ${subnet.network}/${definition.prefix}. Маска: ${subnet.mask}. Последний адрес: ${subnet.broadcast}. Ответ: ${expected}.`,
  }
}
export function checkSubnetAnswer(id: string, answer: string) {
  const exercise = getSubnetExercise(id)
  const input = answer.trim()
  if (exercise.field === 'hosts' ? !/^(?:0|[1-9]\d{0,9})$/.test(input) : !isIPv4(input))
    return {
      valid: false,
      correct: false,
      message:
        exercise.field === 'hosts'
          ? 'Введите целое неотрицательное число.'
          : 'Введите IPv4 в виде четырёх чисел через точку.',
    }
  return { valid: true, correct: input === exercise.expected, message: exercise.explanation }
}
