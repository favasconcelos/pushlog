import { describe, expect, it } from 'vitest'
import { renderJson, renderReport } from '@/cli/render'
import type { CommitEntry, Report } from '@/core/types'

const at = (h: number, m: number, day = 20) => new Date(2026, 9, day, h, m).getTime()

function entry(overrides: Partial<CommitEntry> = {}): CommitEntry {
  return {
    sha: 'abc1234',
    fullSha: 'abc1234'.padEnd(40, '0'),
    committedAt: at(9, 5),
    subject: 'feat: add thing',
    branch: 'main',
    status: 'pushed',
    pushedAt: at(9, 30),
    url: 'https://github.com/o/r/commit/abc1234',
    branchUrl: 'https://github.com/o/r/tree/main',
    ...overrides,
  }
}

function report(
  commits: CommitEntry[],
  range: [string, string] = ['2026-10-20', '2026-10-20'],
): Report {
  const pushed = commits.filter((c) => c.status !== 'local').length
  return {
    since: range[0],
    until: range[1],
    repos: [
      { name: 'repo', gitDir: '/x/repo/.git', slug: 'o/r', url: 'https://github.com/o/r', commits },
    ],
    totals: {
      commits: commits.length,
      pushed,
      local: commits.length - pushed,
      activeRepos: 1,
      scannedRepos: 3,
    },
  }
}

const plain = { color: false, links: 'off' } as const

describe('renderReport', () => {
  it('renders the summary and one line per commit', () => {
    const out = renderReport(
      report([
        entry(),
        entry({ sha: 'def5678', status: 'local', pushedAt: null, subject: 'wip' }),
        entry({ sha: '0123abc', status: 'remote', pushedAt: null, subject: 'from elsewhere' }),
      ]),
      plain,
    )
    const lines = out.split('\n')

    expect(lines[0]).toBe(
      'pushlog  Tue 2026-10-20   3 commits · 2 pushed · 1 local only · 1 active repo (of 3 scanned)',
    )
    expect(lines[2]).toBe('▸ repo  o/r  (3 commits, 2 pushed)')
    expect(lines[3]).toBe('    09:05  abc1234  ↑ 09:30   feat: add thing  main')
    expect(lines[4]).toBe('    09:05  def5678  ✗ local   wip  main')
    expect(lines[5]).toBe('    09:05  0123abc  ↑ remote  from elsewhere  main')
  })

  it('shows the date when a push happened on another day than the commit', () => {
    const out = renderReport(report([entry({ pushedAt: at(8, 15, 21) })]), plain)
    expect(out).toContain('↑ 10-21 08:15')
  })

  it('prefixes dates in a range', () => {
    const out = renderReport(report([entry()], ['2026-10-19', '2026-10-20']), plain)
    expect(out).toContain('2026-10-19 → 2026-10-20')
    expect(out).toContain('    10-20 09:05  abc1234  ↑ 09:30        feat: add thing  main')
  })

  it('truncates long subjects', () => {
    const out = renderReport(report([entry({ subject: 'x'.repeat(100) })]), plain)
    expect(out).toContain(`${'x'.repeat(69)}…`)
    expect(out).not.toContain('x'.repeat(70))
  })

  it('says so when there is nothing to show', () => {
    const empty: Report = {
      since: '2026-10-20',
      until: '2026-10-20',
      repos: [],
      totals: { commits: 0, pushed: 0, local: 0, activeRepos: 0, scannedRepos: 5 },
    }
    expect(renderReport(empty, plain)).toContain('Nothing found for this period.')
  })

  it('wraps names in OSC 8 hyperlinks when asked', () => {
    const out = renderReport(report([entry()]), { color: false, links: 'osc8' })
    expect(out).toContain(
      '\u001b]8;;https://github.com/o/r/commit/abc1234\u0007abc1234\u001b]8;;\u0007',
    )
    expect(out).toContain('\u001b]8;;https://github.com/o/r\u0007repo\u001b]8;;\u0007')
  })

  it('prints raw URLs next to the text in urls mode', () => {
    const out = renderReport(report([entry()]), { color: false, links: 'urls' })
    expect(out).toContain('abc1234 <https://github.com/o/r/commit/abc1234>')
  })

  it('emits no escape codes when plain', () => {
    expect(renderReport(report([entry()]), plain)).not.toContain('\u001b')
  })

  it('colors when asked', () => {
    expect(renderReport(report([entry()]), { color: true, links: 'off' })).toContain(
      '\u001b[1mpushlog',
    )
  })
})

describe('renderJson', () => {
  it('serializes timestamps as ISO strings', () => {
    const parsed = JSON.parse(
      renderJson(report([entry(), entry({ status: 'local', pushedAt: null })])),
    )
    const [pushed, local] = parsed.repos[0].commits
    expect(pushed.committedAt).toBe(new Date(at(9, 5)).toISOString())
    expect(pushed.pushedAt).toBe(new Date(at(9, 30)).toISOString())
    expect(local.pushedAt).toBeNull()
    expect(parsed.totals).toMatchObject({ commits: 2, pushed: 1, local: 1 })
  })
})
