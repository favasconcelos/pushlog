import type { Command } from 'commander'
import { standaloneZshCompletion } from '@/completion/zsh'
import { PushlogError } from '@/util/errors'

export function completionCommand(shell: string, program: Command): void {
  if (shell !== 'zsh') throw new PushlogError('Only zsh is supported for now.')
  process.stdout.write(standaloneZshCompletion(program))
}
