import { execFileSync, spawnSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { standaloneZshCompletion } from '@/completion/zsh'
import { buildProgram } from '@/program'
import { tempDir } from './helpers'

const hasZsh = spawnSync('zsh', ['--version']).status === 0
const program = buildProgram()
const script = standaloneZshCompletion(program)

describe('zsh completion script', () => {
  it('registers itself only when compdef exists', () => {
    expect(script.startsWith('#compdef pushlog\n')).toBe(true)
    expect(script).toContain('(( $+functions[compdef] )) && compdef _pushlog pushlog')
  })

  it('offers dates and subcommands with descriptions', () => {
    expect(script).toContain(`'today:today (default), yesterday, YYYY-MM-DD, or N days ago'`)
    expect(script).toContain(`'completion:print the shell completion script (zsh)'`)
  })

  it('describes every option once, in the right form', () => {
    expect(script).toContain(`'--since=[start of a range (default: the date)]:date:'`)
    expect(script).toContain(`'(-m --merges)'{-m,--merges}'[include merge commits]'`)
    expect(script).toContain(
      `*{-a+,--author=}'[also match commits by this author (repeatable)]:email:'`,
    )
    expect(script).toContain(
      `*{-r+,--root=}'[scan this folder instead of $HOME (repeatable)]:dir:_files -/'`,
    )
    for (const option of program.options) {
      expect(script, option.flags).toContain(option.long as string)
    }
  })
})

describe.runIf(hasZsh)('zsh integration', () => {
  const zsh = (code: string) => execFileSync('zsh', ['-f', '-c', code], { encoding: 'utf8' })

  it('is valid zsh', async () => {
    const file = join(await tempDir(), 'pushlog.zsh')
    await writeFile(file, script)
    expect(() => zsh(`zsh -n ${file}`)).not.toThrow()
  })

  it('registers the completion for pushlog when sourced after compinit', async () => {
    const dir = await tempDir()
    const file = join(dir, 'pushlog.zsh')
    await writeFile(file, script)

    const out = zsh(
      `autoload -Uz compinit && compinit -u -d ${dir}/zcompdump
       source ${file}
       print -- "\${_comps[pushlog]:-none}"`,
    )

    expect(out).toBe('_pushlog\n')
  })

  it('does nothing, and does not fail, without compinit', async () => {
    const file = join(await tempDir(), 'pushlog.zsh')
    await writeFile(file, script)
    expect(zsh(`source ${file}; print ok`)).toBe('ok\n')
  })
})
