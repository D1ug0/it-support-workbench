import type { CommandKind } from '../../../domain/types/diagnostic'
import { analyzeOutput } from '../application/analyzeOutput'

self.onmessage = (event: MessageEvent<{ text: string; mode: 'auto' | CommandKind }>) => {
  self.postMessage(analyzeOutput(event.data.text, event.data.mode))
}
