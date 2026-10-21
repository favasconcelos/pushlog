import { clockOf, dayLabel, dayOf, monthDayClockOf } from '@/core/dates'
import type { CommitEntry, Report } from '@/core/types'
import { colors, noColors, type Painter, plural, truncate } from '@/util/format'

export interface RenderStyle {
  color: boolean
  /** `osc8` makes text clickable in supporting terminals, `urls` prints `text <url>`. */
  links: 'osc8' | 'urls' | 'off'
}

const SUBJECT_MAX = 70

function linker(mode: RenderStyle['links']) {
  return (url: string | null, text: string): string => {
    if (!url || mode === 'off') return text
    return mode === 'osc8' ? `\u001b]8;;${url}\u0007${text}\u001b]8;;\u0007` : `${text} <${url}>`
  }
}

function pushLabel(commit: CommitEntry): string {
  if (commit.status === 'remote') return 'remote'
  if (commit.status === 'local' || commit.pushedAt === null) return 'local'
  return dayOf(commit.pushedAt) === dayOf(commit.committedAt)
    ? clockOf(commit.pushedAt)
    : monthDayClockOf(commit.pushedAt)
}

function renderCommit(
  commit: CommitEntry,
  singleDay: boolean,
  p: Painter,
  link: ReturnType<typeof linker>,
) {
  const width = singleDay ? 6 : 11
  const when = singleDay ? clockOf(commit.committedAt) : monthDayClockOf(commit.committedAt)
  const label = pushLabel(commit).padEnd(width)
  const status =
    commit.status === 'local' ? `${p.yellow('✗')} ${p.yellow(label)}` : `${p.green('↑')} ${label}`
  const subject = truncate(commit.subject, SUBJECT_MAX)
  return `    ${p.dim(when)}  ${p.yellow(link(commit.url, commit.sha))}  ${status}  ${subject}  ${p.dim(link(commit.branchUrl, commit.branch))}`
}

export function renderReport(report: Report, style: RenderStyle): string {
  const p = style.color ? colors : noColors
  const link = linker(style.links)
  const singleDay = report.since === report.until
  const { totals } = report

  const label = singleDay ? dayLabel(report.since) : `${report.since} → ${report.until}`
  const summary = [
    plural(totals.commits, 'commit'),
    `${totals.pushed} pushed`,
    `${totals.local} local only`,
    `${plural(totals.activeRepos, 'active repo')} (of ${totals.scannedRepos} scanned)`,
  ].join(' · ')
  const lines = [`${p.bold('pushlog')}  ${label}   ${p.dim(summary)}`, '']

  if (totals.activeRepos === 0) {
    lines.push('Nothing found for this period.')
    return `${lines.join('\n')}\n`
  }

  for (const repo of report.repos) {
    const pushed = repo.commits.filter((c) => c.status !== 'local').length
    const slug = repo.slug ? `  ${p.dim(repo.slug)}` : ''
    lines.push(
      `${p.cyan('▸ ')}${p.bold(link(repo.url, repo.name))}${slug}  ${p.dim(`(${plural(repo.commits.length, 'commit')}, ${pushed} pushed)`)}`,
    )
    for (const commit of repo.commits) lines.push(renderCommit(commit, singleDay, p, link))
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}

export function renderJson(report: Report): string {
  const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString())
  return `${JSON.stringify(
    {
      ...report,
      repos: report.repos.map((repo) => ({
        ...repo,
        commits: repo.commits.map((c) => ({
          ...c,
          committedAt: iso(c.committedAt),
          pushedAt: iso(c.pushedAt),
        })),
      })),
    },
    null,
    2,
  )}\n`
}
