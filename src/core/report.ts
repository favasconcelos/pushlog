import { basename } from 'node:path'
import {
  configValue,
  isAncestor,
  isOnRemote,
  type Push,
  type RawCommit,
  readCommits,
  readPushes,
  remoteUrl,
} from '@/core/git'
import { createHostResolver, parseRemote, type WebLinks, webLinks } from '@/core/remote'
import type { CommitEntry, RepoReport, Report, ReportOptions } from '@/core/types'
import { mapLimit } from '@/util/concurrency'

/** A push can only contain commits made before it; allow for small clock differences. */
const CLOCK_SKEW_SECONDS = 60

/** `refs/heads/main`, `refs/remotes/origin/feature/x`, `refs/tags/v1` to the name people know. */
export function branchName(source: string): string {
  if (source.startsWith('refs/heads/')) return source.slice('refs/heads/'.length)
  if (source.startsWith('refs/remotes/'))
    return source.slice('refs/remotes/'.length).replace(/^[^/]+\//, '')
  if (source.startsWith('refs/tags/')) return source.slice('refs/tags/'.length)
  return source
}

/** The earliest recorded push whose tip contains the commit. */
async function findPush(gitDir: string, commit: RawCommit, pushes: Push[]): Promise<Push | null> {
  for (const push of pushes) {
    if (push.at < commit.committedAt - CLOCK_SKEW_SECONDS) continue
    if (await isAncestor(gitDir, commit.fullSha, push.sha)) return push
  }
  return null
}

async function toEntry(gitDir: string, commit: RawCommit, pushes: Push[], links: WebLinks | null) {
  const push = await findPush(gitDir, commit, pushes)
  const branch = branchName(commit.source)
  const status: CommitEntry['status'] = push
    ? 'pushed'
    : (await isOnRemote(gitDir, commit.fullSha))
      ? 'remote'
      : 'local'
  return {
    sha: commit.sha,
    fullSha: commit.fullSha,
    committedAt: commit.committedAt * 1000,
    subject: commit.subject,
    branch,
    status,
    pushedAt: push ? push.at * 1000 : null,
    url: links?.commit(commit.sha) ?? null,
    branchUrl: links?.branch(branch) ?? null,
  } satisfies CommitEntry
}

interface Context {
  options: ReportOptions
  globalEmail: string | null
  resolveHost: (host: string) => Promise<string>
}

async function authorsFor(gitDir: string, ctx: Context): Promise<string[] | null> {
  if (ctx.options.allAuthors) return []
  const local = await configValue(gitDir, 'user.email')
  const authors = new Set(
    [local, ctx.globalEmail, ...ctx.options.authors].filter((a): a is string => Boolean(a)),
  )
  // Without any identity there is no telling which commits are yours.
  return authors.size > 0 ? [...authors] : null
}

async function reportRepo(gitDir: string, ctx: Context): Promise<RepoReport | null> {
  const authors = await authorsFor(gitDir, ctx)
  if (authors === null) return null

  const raw = await readCommits(gitDir, {
    since: ctx.options.since,
    until: ctx.options.until,
    merges: ctx.options.merges,
    authors,
  })
  if (raw.length === 0) return null

  const [pushes, remote] = await Promise.all([readPushes(gitDir), remoteUrl(gitDir)])
  const parsed = remote ? parseRemote(remote) : null
  const links = parsed
    ? webLinks({ host: await ctx.resolveHost(parsed.host), slug: parsed.slug })
    : null

  const commits: CommitEntry[] = []
  for (const commit of raw) commits.push(await toEntry(gitDir, commit, pushes, links))

  const worktree = gitDir.endsWith('/.git') ? gitDir.slice(0, -'/.git'.length) : gitDir
  return {
    name: basename(worktree),
    gitDir,
    slug: parsed?.slug ?? null,
    url: links?.repo ?? null,
    commits,
  }
}

/** Commits made in the period across the given repositories, and whether each was pushed. */
export async function buildReport(gitDirs: string[], options: ReportOptions): Promise<Report> {
  const ctx: Context = {
    options,
    globalEmail: await configValue(null, 'user.email'),
    resolveHost: createHostResolver(),
  }
  const results = await mapLimit(gitDirs, options.jobs, (gitDir) => reportRepo(gitDir, ctx))
  const repos = results.filter((r): r is RepoReport => r !== null)

  const commits = repos.reduce((sum, r) => sum + r.commits.length, 0)
  const pushed = repos.reduce(
    (sum, r) => sum + r.commits.filter((c) => c.status !== 'local').length,
    0,
  )
  return {
    since: options.since,
    until: options.until,
    repos,
    totals: {
      commits,
      pushed,
      local: commits - pushed,
      activeRepos: repos.length,
      scannedRepos: gitDirs.length,
    },
  }
}
