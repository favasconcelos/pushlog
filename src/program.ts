import { Command } from 'commander'
import { completionCommand } from '@/cli/commands/completion'
import { reportCommand } from '@/cli/commands/report'
import { PushlogError } from '@/util/errors'
import pkg from '../package.json' with { type: 'json' }

const collect = (value: string, previous: string[]) => [...previous, value]

/** Builds the command tree without running it, so it can also be inspected (completion, tests). */
export function buildProgram(): Command {
  const program = new Command()

  /** Wraps an action so expected failures print a clean message instead of a stack trace. */
  function action<A extends unknown[]>(fn: (...args: A) => Promise<void> | void) {
    return async (...args: A) => {
      try {
        await fn(...args)
      } catch (error) {
        if (error instanceof PushlogError) {
          console.error(`pushlog: ${error.message}`)
        } else {
          console.error(error)
        }
        process.exitCode = 1
      }
    }
  }

  program
    .name('pushlog')
    .description(
      'List the commits you made across every git repo on this machine, and whether each was pushed.',
    )
    .version(pkg.version)
    .argument('[date]', 'today (default), yesterday, YYYY-MM-DD, or N days ago')
    .option('--since <date>', 'start of a range (default: the date)')
    .option('--until <date>', 'end of a range (default: the date)')
    .option('--days <n>', 'the last N days, including today')
    .option(
      '-a, --author <email>',
      'also match commits by this author (repeatable)',
      collect,
      [] as string[],
    )
    .option('--all-authors', 'do not filter by author')
    .option('-m, --merges', 'include merge commits')
    .option(
      '-r, --root <dir>',
      'scan this folder instead of $HOME (repeatable)',
      collect,
      [] as string[],
    )
    .option('--depth <n>', 'max directory depth to scan', '6')
    .option('--rescan', 'refresh the cached repo list (it lasts 12h)')
    .option('--urls', 'print raw URLs next to the text, for terminals without clickable links')
    .option('--links', 'force clickable links on')
    .option('--plain', 'no links and no colors')
    .option('--json', 'print the report as JSON')
    .addHelpText(
      'after',
      `
Each commit is marked "↑ HH:MM" when it was pushed (and when), "↑ remote" when it is on a
remote but no push from this machine was recorded, or "✗ local" when it has not been pushed.
Your global git email and each repo's own git email are always matched.

Push times come from each repo's reflog (remote-tracking branch updates), so they only cover
pushes made from this machine, for as long as git keeps the reflog (~90 days).`,
    )
    .action(action(reportCommand))

  program
    .command('completion <shell>')
    .description('print the shell completion script (zsh)')
    .action(action((shell: string) => completionCommand(shell, program)))

  return program
}
