import type { Command, Option } from 'commander'

/** Single-quotes a string for zsh. */
const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`
/** Escapes text inside `[description]` of an _arguments spec. */
const describe = (value: string) => value.replace(/[\\[\]]/g, '\\$&')
/** Escapes the `message` part of an _arguments spec, where `:` is a separator. */
const message = (value: string) => value.replace(/[\\:]/g, '\\$&')
/** Escapes the name in a `_describe` entry (`name:description`). */
const entryName = (value: string) => value.replace(/[\\:]/g, '\\$&')

/** zsh completion action for the value of an option, by long flag. */
const OPTION_ACTIONS: Record<string, string> = { '--root': '_files -/' }

/** Values offered for the first positional argument, next to the subcommands. */
const DATE_VALUES = ['today', 'yesterday']

function optionSpec(option: Option): string {
  const argName = /[<[]([^>\]]+)[>\]]/.exec(option.flags)?.[1]
  const names = [option.short, option.long].filter((n): n is string => Boolean(n))
  const action = (option.long && OPTION_ACTIONS[option.long]) || ''
  // Options collected into a list (like --author) may be given more than once.
  const repeatable = Array.isArray(option.defaultValue)

  const withSuffix = (name: string) =>
    `${name}${argName ? (name.startsWith('--') ? '=' : '+') : ''}`
  const tail = `[${describe(option.description ?? '')}]${argName ? `:${message(argName)}:${action}` : ''}`

  if (repeatable) {
    const flags =
      names.length === 1 ? withSuffix(names[0] as string) : `{${names.map(withSuffix).join(',')}}`
    return names.length === 1 ? quote(`*${flags}${tail}`) : `*${flags}${quote(tail)}`
  }
  if (names.length === 1) return quote(`${withSuffix(names[0] as string)}${tail}`)
  return `${quote(`(${names.join(' ')})`)}{${names.map(withSuffix).join(',')}}${quote(tail)}`
}

/**
 * Standalone zsh completion script for `source <(pushlog completion zsh)`; needs compinit to have
 * run. Generated from the command tree so it cannot drift from the real options.
 */
export function standaloneZshCompletion(program: Command): string {
  const name = program.name()
  const fn = `_${name.replace(/[^A-Za-z0-9_]/g, '_')}`
  const dateHelp = program.registeredArguments[0]?.description ?? ''
  const entries: Array<[string, string]> = [
    ...DATE_VALUES.map((value): [string, string] => [value, dateHelp]),
    ...program.commands.map((sub): [string, string] => [sub.name(), sub.description()]),
  ]
  const specs = [
    ...program.options.map(optionSpec),
    `'(- *)'{-h,--help}${quote('[display help for command]')}`,
    quote(`1:${message('date or command')}:->first`),
    quote(`2::${message('shell')}:->second`),
  ]

  return `#compdef ${name}
${fn}() {
  local curcontext="$curcontext" state line
  typeset -A opt_args
  local -a first
  first=(
${entries.map(([n, d]) => `    ${quote(`${entryName(n)}:${d}`)}`).join('\n')}
  )
  _arguments -C \\
${specs.map((s) => `    ${s}`).join(' \\\n')}
  case $state in
    first) _describe -t first ${quote('date or command')} first ;;
    second) [[ $line[1] == completion ]] && _values ${quote('shell')} zsh ;;
  esac
}

(( $+functions[compdef] )) && compdef ${fn} ${name}
`
}
