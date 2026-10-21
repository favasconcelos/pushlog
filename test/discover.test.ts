import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CACHE_TTL_MS, discoverRepos, resolveRoots } from '@/core/discover'
import { at, commit, git, initRepo, tempDir } from './helpers'

async function makeRepo(dir: string) {
  await mkdir(dir, { recursive: true })
  initRepo(dir)
}

async function discover(
  root: string,
  cache: string,
  extra: Partial<Parameters<typeof discoverRepos>[0]> = {},
) {
  return discoverRepos({ roots: [root], depth: 6, rescan: false, cacheDir: cache, ...extra })
}

describe('discoverRepos', () => {
  it('finds nested repositories and returns their .git directories, sorted', async () => {
    const root = await tempDir()
    await makeRepo(join(root, 'b'))
    await makeRepo(join(root, 'group', 'a'))

    const repos = await discover(root, await tempDir())

    expect(repos).toEqual([join(root, 'b', '.git'), join(root, 'group', 'a', '.git')])
  })

  it('does not look inside .git, node_modules or other skipped folders', async () => {
    const root = await tempDir()
    await makeRepo(join(root, 'app'))
    await makeRepo(join(root, 'app', 'node_modules', 'dep'))
    await makeRepo(join(root, 'Library', 'thing'))
    await makeRepo(join(root, '.cache', 'thing'))

    expect(await discover(root, await tempDir())).toEqual([join(root, 'app', '.git')])
  })

  it('respects the depth limit', async () => {
    const root = await tempDir()
    await makeRepo(join(root, 'one'))
    await makeRepo(join(root, 'x', 'two'))
    await makeRepo(join(root, 'x', 'y', 'three'))

    expect(await discover(root, await tempDir(), { depth: 1, rescan: true })).toEqual([])
    expect(await discover(root, await tempDir(), { depth: 2 })).toEqual([join(root, 'one', '.git')])
    expect(await discover(root, await tempDir(), { depth: 3 })).toEqual([
      join(root, 'one', '.git'),
      join(root, 'x', 'two', '.git'),
    ])
    expect(await discover(root, await tempDir(), { depth: 4 })).toHaveLength(3)
  })

  it('finds a repository at the root itself', async () => {
    const root = await tempDir()
    initRepo(root)
    expect(await discover(root, await tempDir(), { depth: 1 })).toEqual([join(root, '.git')])
  })

  it('collapses linked worktrees into their main repository', async () => {
    const root = await tempDir()
    const main = join(root, 'main')
    await makeRepo(main)
    await commit(main, 'init', at(1))
    git(main, 'worktree', 'add', '-q', join(root, 'linked'), '-b', 'other')

    expect(await discover(root, await tempDir())).toEqual([join(main, '.git')])
  })

  it('ignores directories that are not repositories', async () => {
    const root = await tempDir()
    await mkdir(join(root, 'plain'))
    await writeFile(join(root, 'file.txt'), '')
    await writeFile(join(root, 'plain', '.git'), 'not a real gitfile')

    expect(await discover(root, await tempDir())).toEqual([])
  })

  describe('cache', () => {
    it('reuses the cached list until it is stale, rescan is requested or settings change', async () => {
      const root = await tempDir()
      const cache = await tempDir()
      await makeRepo(join(root, 'one'))
      const scans: number[] = []
      const options = { onScan: () => scans.push(1) }

      await discover(root, cache, { ...options, now: 1_000 })
      await makeRepo(join(root, 'two'))

      expect(await discover(root, cache, { ...options, now: 2_000 })).toHaveLength(1)
      expect(scans).toHaveLength(1)

      expect(await discover(root, cache, { ...options, now: 2_000, rescan: true })).toHaveLength(2)
      expect(scans).toHaveLength(2)

      await makeRepo(join(root, 'three'))
      expect(await discover(root, cache, { ...options, now: 2_000, depth: 5 })).toHaveLength(3)
      expect(scans).toHaveLength(3)

      await makeRepo(join(root, 'four'))
      expect(
        await discover(root, cache, { ...options, now: 2_000 + CACHE_TTL_MS + 1, depth: 5 }),
      ).toHaveLength(4)
      expect(scans).toHaveLength(4)
    })

    it('recovers from a corrupt cache file', async () => {
      const root = await tempDir()
      const cache = await tempDir()
      await makeRepo(join(root, 'one'))
      await writeFile(join(cache, 'repos.json'), '{nope')

      expect(await discover(root, cache)).toHaveLength(1)
    })
  })
})

describe('resolveRoots', () => {
  it('resolves relative paths and rejects missing folders', async () => {
    const dir = await tempDir()
    expect(await resolveRoots([dir])).toEqual([dir])
    await expect(resolveRoots([join(dir, 'missing')])).rejects.toThrow(/Not a directory/)
  })

  it('defaults to the home folder', async () => {
    expect(await resolveRoots([])).toEqual([process.env.HOME])
  })
})
