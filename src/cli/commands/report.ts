import { type RenderStyle, renderJson, renderReport } from '@/cli/render'
import { lastDays, resolveDate } from '@/core/dates'
import { cacheDir as defaultCacheDir, discoverRepos, resolveRoots } from '@/core/discover'
import { gitAvailable } from '@/core/git'
import { buildReport } from '@/core/report'
import { PushlogError } from '@/util/errors'

export interface ReportFlags {
  since?: string
  until?: string
  days?: string
  author: string[]
  allAuthors?: boolean
  merges?: boolean
  root: string[]
  depth: string
  rescan?: boolean
  urls?: boolean
  links?: boolean
  plain?: boolean
  json?: boolean
}

function positiveInt(name: string, value: string): number {
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new PushlogError(`${name} must be a positive integer, got "${value}".`)
  }
  return Number(value)
}

function resolvePeriod(
  date: string | undefined,
  flags: ReportFlags,
): { since: string; until: string } {
  if (flags.days !== undefined) {
    if (date !== undefined || flags.since !== undefined || flags.until !== undefined) {
      throw new PushlogError('--days cannot be combined with a date, --since or --until.')
    }
    return lastDays(positiveInt('--days', flags.days))
  }
  const single = date === undefined ? undefined : resolveDate(date)
  const since =
    flags.since === undefined ? (single ?? resolveDate('today')) : resolveDate(flags.since)
  const until = flags.until === undefined ? (single ?? since) : resolveDate(flags.until)
  if (since > until) throw new PushlogError('--since is after --until.')
  return { since, until }
}

function resolveStyle(flags: ReportFlags): RenderStyle {
  if (flags.plain) return { color: false, links: 'off' }
  const tty = process.stdout.isTTY === true
  return {
    color: tty && !process.env.NO_COLOR,
    links: flags.links || (tty && !flags.urls) ? 'osc8' : flags.urls ? 'urls' : 'off',
  }
}

export async function reportCommand(date: string | undefined, flags: ReportFlags): Promise<void> {
  const { since, until } = resolvePeriod(date, flags)
  const depth = positiveInt('--depth', flags.depth)
  const jobs = Number(process.env.PUSHLOG_JOBS) > 0 ? Number(process.env.PUSHLOG_JOBS) : 8
  if (!(await gitAvailable())) throw new PushlogError('git was not found on your PATH.')

  const roots = await resolveRoots(flags.root)
  const interactive = process.stderr.isTTY === true && !flags.json
  const repos = await discoverRepos({
    roots,
    depth,
    rescan: flags.rescan === true,
    cacheDir: defaultCacheDir(),
    onScan: () => {
      if (interactive) process.stderr.write(`Scanning ${roots.join(' ')} for git repositories...`)
    },
  })
  if (interactive) process.stderr.write('\r\u001b[K')

  const report = await buildReport(repos, {
    since,
    until,
    authors: flags.author,
    allAuthors: flags.allAuthors === true,
    merges: flags.merges === true,
    jobs,
  })

  process.stdout.write(flags.json ? renderJson(report) : renderReport(report, resolveStyle(flags)))
}
