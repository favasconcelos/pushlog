import { run } from '@/util/exec'

const SEP = '\u001f'

export interface RawCommit {
  sha: string
  fullSha: string
  /** Committer time, seconds since epoch. */
  committedAt: number
  /** The ref the commit was reached from, e.g. `refs/heads/main`. */
  source: string
  subject: string
}

export interface Push {
  sha: string
  /** Seconds since epoch. */
  at: number
}

const git = (gitDir: string, args: readonly string[]) =>
  run('git', ['--git-dir', gitDir, ...args], { timeoutMs: 60_000 })

export async function gitAvailable(): Promise<boolean> {
  return (await run('git', ['--version'], { timeoutMs: 10_000 })).ok
}

/** The git directory shared by all worktrees of the repository containing `dir`. */
export async function commonDir(dir: string): Promise<string | null> {
  const result = await run(
    'git',
    ['-C', dir, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
    {
      timeoutMs: 15_000,
    },
  )
  return result.ok ? result.stdout.trim() || null : null
}

export async function configValue(gitDir: string | null, key: string): Promise<string | null> {
  const args = gitDir
    ? ['--git-dir', gitDir, 'config', '--get', key]
    : ['config', '--global', '--get', key]
  const result = await run('git', args, { timeoutMs: 10_000 })
  return result.ok ? result.stdout.trim() || null : null
}

/** The repo's `origin` URL, or its first remote's when there is no origin. */
export async function remoteUrl(gitDir: string): Promise<string | null> {
  const origin = await configValue(gitDir, 'remote.origin.url')
  if (origin) return origin
  const result = await git(gitDir, ['config', '--get-regexp', '^remote\\..*\\.url$'])
  const first = result.stdout.split('\n')[0]?.trim()
  return first?.split(/\s+/)[1] ?? null
}

export interface LogQuery {
  /** YYYY-MM-DD, inclusive. */
  since: string
  /** YYYY-MM-DD, inclusive. */
  until: string
  merges: boolean
  /** Emails or names to match; empty matches every author. */
  authors: string[]
}

/** Commits from every ref (stash excluded) in the period, oldest first. */
export async function readCommits(gitDir: string, query: LogQuery): Promise<RawCommit[]> {
  const result = await git(gitDir, [
    'log',
    '--exclude=refs/stash',
    '--all',
    '--source',
    `--since=${query.since} 00:00:00`,
    `--until=${query.until} 23:59:59`,
    ...(query.merges ? [] : ['--no-merges']),
    ...(query.authors.length > 0 ? ['--fixed-strings', '--regexp-ignore-case'] : []),
    ...query.authors.flatMap((author) => [`--author=${author}`]),
    `--pretty=format:%h${SEP}%ct${SEP}%S${SEP}%H${SEP}%s`,
  ])
  if (!result.ok) return []

  return result.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha = '', ct = '0', source = '', fullSha = '', ...subject] = line.split(SEP)
      return { sha, fullSha, source, committedAt: Number(ct), subject: subject.join(SEP) }
    })
    .sort((a, b) => a.committedAt - b.committedAt)
}

/**
 * Pushes recorded in the reflogs of remote-tracking branches ("update by push"), earliest first.
 * Only covers pushes made from this machine, for as long as git keeps the reflog.
 */
export async function readPushes(gitDir: string): Promise<Push[]> {
  const result = await git(gitDir, [
    'reflog',
    'show',
    '--all',
    '--date=unix',
    `--format=%H${SEP}%gD${SEP}%gs`,
  ])
  const earliest = new Map<string, number>()
  for (const line of result.stdout.split('\n')) {
    const [sha, selector, message] = line.split(SEP)
    if (!sha || message !== 'update by push') continue
    const match = /^refs\/remotes\/.+@\{(\d+)\}$/.exec(selector ?? '')
    if (!match) continue
    const at = Number(match[1])
    const known = earliest.get(sha)
    if (known === undefined || at < known) earliest.set(sha, at)
  }
  return [...earliest].map(([sha, at]) => ({ sha, at })).sort((a, b) => a.at - b.at)
}

export async function isAncestor(
  gitDir: string,
  ancestor: string,
  descendant: string,
): Promise<boolean> {
  return (await git(gitDir, ['merge-base', '--is-ancestor', ancestor, descendant])).code === 0
}

export async function isOnRemote(gitDir: string, sha: string): Promise<boolean> {
  const result = await git(gitDir, ['for-each-ref', '--count=1', '--contains', sha, 'refs/remotes'])
  return result.stdout.trim().length > 0
}
