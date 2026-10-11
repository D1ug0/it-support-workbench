const INPUT_LIMIT = 512
const HISTORY_LIMIT = 50

export function cleanTerminalText(value: string) {
  return [...value]
    .filter((c) => {
      const code = c.charCodeAt(0)
      return [9, 10, 13].includes(code) || (code >= 32 && (code < 127 || code > 159))
    })
    .join('')
}

// Both renderers edit the same line. Clipboard text never becomes an execution request.
export class CommandLine {
  line = ''
  caret = 0
  history: string[] = []
  position = 0
  private draft = ''
  private searchQuery = ''
  private searchPosition = -1

  set(value: string, caret?: number) {
    this.line = cleanTerminalText(value)
      .replace(/[\r\n\t]+/g, ' ')
      .slice(0, INPUT_LIMIT)
    this.caret = Math.max(0, Math.min(this.line.length, caret ?? this.line.length))
  }

  edit(value: string, caret?: number) {
    this.set(value, caret)
    this.position = this.history.length
    this.draft = this.line
    this.searchPosition = -1
  }

  insert(value: string) {
    const text = cleanTerminalText(value).replace(/[\r\n\t]+/g, ' ')
    this.edit(
      this.line.slice(0, this.caret) + text + this.line.slice(this.caret),
      this.caret + text.length,
    )
  }

  remove(backward: boolean) {
    if (backward && this.caret > 0)
      this.edit(this.line.slice(0, this.caret - 1) + this.line.slice(this.caret), this.caret - 1)
    else if (!backward)
      this.edit(this.line.slice(0, this.caret) + this.line.slice(this.caret + 1), this.caret)
  }

  move(offset: number) {
    this.caret = Math.max(0, Math.min(this.line.length, this.caret + offset))
  }

  previous(direction: -1 | 1) {
    if (this.position === this.history.length) this.draft = this.line
    this.position = Math.max(0, Math.min(this.history.length, this.position + direction))
    this.set(this.history[this.position] ?? this.draft)
    this.searchPosition = -1
  }

  search() {
    if (this.searchPosition === -1) this.searchQuery = this.line
    const matches = [...new Set([...this.history].reverse())].filter((command) =>
      command.toLowerCase().includes(this.searchQuery.toLowerCase()),
    )
    if (!matches.length) return false
    this.searchPosition = (this.searchPosition + 1) % matches.length
    this.set(matches[this.searchPosition]!)
    return true
  }

  complete(commands: string[]) {
    const prefix = this.line.toLowerCase()
    const matches = [...new Set(commands)].filter((command) =>
      command.toLowerCase().startsWith(prefix),
    )
    if (matches.length === 1) this.edit(matches[0]!)
    else if (matches.length > 1 && prefix.length) {
      let common = matches[0]!
      for (const match of matches.slice(1)) {
        let length = 0
        while (
          length < common.length &&
          common[length]!.toLowerCase() === match[length]?.toLowerCase()
        )
          length++
        common = common.slice(0, length)
      }
      if (common.length > this.line.length) this.edit(common)
    }
    return matches
  }

  submit() {
    const command = this.line.trim()
    if (!command) return undefined
    if (this.history.at(-1) !== command)
      this.history = [...this.history, command].slice(-HISTORY_LIMIT)
    this.clear()
    return command
  }

  clear() {
    this.set('')
    this.position = this.history.length
    this.draft = ''
    this.searchPosition = -1
  }

  reset(history: string[] = []) {
    this.history = history.slice(-HISTORY_LIMIT).map((command) =>
      cleanTerminalText(command)
        .replace(/[\r\n\t]+/g, ' ')
        .slice(0, INPUT_LIMIT),
    )
    this.clear()
  }
}
