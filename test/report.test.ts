import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { branchName, buildReport } from '@/core/report'
import { at, commit, dayAgo, git, gitEnv, initRepo, reportOptions, tempDir } from './helpers'

/** A work repo with a bare "origin" next to it. */
async function repoWithRemote() {
  const root = await tempDir()
  const work = join(root, 'work')
  const origin = join(root, 'origin.git')
  git(root, 'init', '-q', '--bare', '-b', 'main', origin)
  git(root, 'init', '-q', '-b', 'main', work)
  initRepo(work)
  git(work, 'remote', 'add', 'origin', 'git@github.com:acme/widgets.git')
  git(work, 'config', 'remote.origin.pushurl', origin)
  return { root, work, origin, gitDir: join(work, '.git') }
}

describe('buildReport', () => {
  it('marks commits as pushed, with the time of the push, or local', async () => {
    const { work, gitDir } = await repoWithRemote()
    await commit(work, 'first', at(2))
    git(work, 'push', '-q', 'origin', 'main')
    await commit(work, 'second', at(2, 11))

    const report = await buildReport([gitDir], reportOptions(dayAgo(2)))

    expect(report.totals).toEqual({
      commits: 2,
      pushed: 1,
      local: 1,
      activeRepos: 1,
      scannedRepos: 1,
    })
    const [first, second] = report.repos[0]?.commits ?? []
    expect(first).toMatchObject({ subject: 'first', status: 'pushed', branch: 'main' })
    expect(first?.pushedAt).toBeGreaterThan(at(2).getTime())
    expect(second).toMatchObject({ subject: 'second', status: 'local', pushedAt: null })
  })

  it('builds links from the remote and names the repo after its worktree', async () => {
    const { work, gitDir } = await repoWithRemote()
    const sha = await commit(work, 'linked', at(1))

    const [repo] = (await buildReport([gitDir], reportOptions(dayAgo(1), { jobs: 1 }))).repos

    expect(repo).toMatchObject({
      name: 'work',
      slug: 'acme/widgets',
      url: 'https://github.com/acme/widgets',
    })
    expect(repo?.commits[0]?.url).toBe(`https://github.com/acme/widgets/commit/${sha.slice(0, 7)}`)
    expect(repo?.commits[0]?.branchUrl).toBe('https://github.com/acme/widgets/tree/main')
  })

  it('reports a commit that is on a remote but was not pushed from here as "remote"', async () => {
    const { root, work, origin, gitDir } = await repoWithRemote()
    await commit(work, 'base', at(5))
    git(work, 'push', '-q', 'origin', 'main')

    const other = join(root, 'other')
    git(root, 'clone', '-q', origin, other)
    initRepo(other)
    await commit(other, 'from another machine', at(2))
    git(other, 'push', '-q', 'origin', 'main')
    // Fetch from the bare repo directly: `origin` points at a fake GitHub URL.
    git(work, 'fetch', '-q', origin, 'main:refs/remotes/origin/main')

    const report = await buildReport([gitDir], reportOptions(dayAgo(2)))

    expect(report.repos[0]?.commits[0]).toMatchObject({ status: 'remote', pushedAt: null })
    expect(report.totals).toMatchObject({ commits: 1, pushed: 1, local: 0 })
  })

  it('only includes the configured author by default, and everyone with allAuthors', async () => {
    const { work, gitDir } = await repoWithRemote()
    await commit(work, 'mine', at(1))
    await commit(work, 'theirs', at(1, 11), { email: 'other@test.dev' })

    const mine = await buildReport([gitDir], reportOptions(dayAgo(1)))
    expect(mine.repos[0]?.commits.map((c) => c.subject)).toEqual(['mine'])

    const everyone = await buildReport([gitDir], reportOptions(dayAgo(1), { allAuthors: true }))
    expect(everyone.repos[0]?.commits.map((c) => c.subject)).toEqual(['mine', 'theirs'])

    const extra = await buildReport(
      [gitDir],
      reportOptions(dayAgo(1), { authors: ['OTHER@test.dev'] }),
    )
    expect(extra.repos[0]?.commits.map((c) => c.subject)).toEqual(['mine', 'theirs'])
  })

  it('matches authors literally, not as a regex', async () => {
    const { work, gitDir } = await repoWithRemote()
    await commit(work, 'someone else', at(1), { email: 'meXtestXdev@test.dev' })

    const report = await buildReport(
      [gitDir],
      reportOptions(dayAgo(1), { authors: ['me.test.dev'] }),
    )

    expect(report.totals.commits).toBe(0)
  })

  it('skips repos without any identity to match against', async () => {
    const { work, gitDir } = await repoWithRemote()
    await commit(work, 'mine', at(1))
    git(work, 'config', '--unset', 'user.email')

    const report = await buildReport([gitDir], reportOptions(dayAgo(1), { authors: [] }))

    expect(report.totals.activeRepos).toBe(0)
  })

  it('hides merge commits unless asked', async () => {
    const { work, gitDir } = await repoWithRemote()
    await commit(work, 'base', at(3))
    git(work, 'checkout', '-q', '-b', 'topic')
    await commit(work, 'topic work', at(2))
    git(work, 'checkout', '-q', 'main')
    await commit(work, 'main work', at(2, 11))
    const iso = at(2, 12).toISOString()
    gitEnv(
      work,
      { GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso },
      'merge',
      '-q',
      '--no-ff',
      '-m',
      'Merge topic',
      'topic',
    )

    const without = await buildReport([gitDir], reportOptions(dayAgo(2)))
    expect(without.repos[0]?.commits.map((c) => c.subject)).toEqual(['topic work', 'main work'])

    const withMerges = await buildReport([gitDir], reportOptions(dayAgo(2), { merges: true }))
    expect(withMerges.repos[0]?.commits.map((c) => c.subject)).toContain('Merge topic')
  })

  it('covers a range of days', async () => {
    const { work, gitDir } = await repoWithRemote()
    await commit(work, 'old', at(5))
    await commit(work, 'day three', at(3))
    await commit(work, 'day one', at(1))

    const report = await buildReport(
      [gitDir],
      reportOptions(dayAgo(3), { since: dayAgo(3), until: dayAgo(1) }),
    )

    expect(report.repos[0]?.commits.map((c) => c.subject)).toEqual(['day three', 'day one'])
  })

  it('finds commits on branches that are not checked out', async () => {
    const { work, gitDir } = await repoWithRemote()
    await commit(work, 'base', at(4))
    git(work, 'checkout', '-q', '-b', 'feature/side')
    await commit(work, 'side work', at(1))
    git(work, 'checkout', '-q', 'main')

    const report = await buildReport([gitDir], reportOptions(dayAgo(1)))

    expect(report.repos[0]?.commits[0]).toMatchObject({
      subject: 'side work',
      branch: 'feature/side',
    })
  })

  it('omits repos with nothing in the period and counts them as scanned', async () => {
    const { work, gitDir } = await repoWithRemote()
    await commit(work, 'long ago', at(10))

    const report = await buildReport([gitDir], reportOptions(dayAgo(1)))

    expect(report.repos).toEqual([])
    expect(report.totals).toMatchObject({ commits: 0, activeRepos: 0, scannedRepos: 1 })
  })

  it('handles repos without a remote', async () => {
    const dir = await tempDir()
    initRepo(dir)
    await commit(dir, 'local only', at(1))

    const [repo] = (await buildReport([join(dir, '.git')], reportOptions(dayAgo(1)))).repos

    expect(repo).toMatchObject({ slug: null, url: null })
    expect(repo?.commits[0]).toMatchObject({ status: 'local', url: null, branchUrl: null })
  })

  it('uses the email from the repository config', async () => {
    const dir = await tempDir()
    initRepo(dir, 'work@corp.dev')
    await commit(dir, 'at work', at(1), { email: 'work@corp.dev' })

    const report = await buildReport([join(dir, '.git')], reportOptions(dayAgo(1), { authors: [] }))

    expect(report.totals.commits).toBe(1)
  })
})

describe('branchName', () => {
  it.each([
    ['refs/heads/main', 'main'],
    ['refs/heads/feature/x', 'feature/x'],
    ['refs/remotes/origin/feature/x', 'feature/x'],
    ['refs/tags/v1.0.0', 'v1.0.0'],
    ['HEAD', 'HEAD'],
  ])('%s -> %s', (source, expected) => {
    expect(branchName(source)).toBe(expected)
  })
})
