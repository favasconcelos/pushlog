import type { Dirent } from 'node:fs'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { commonDir } from '@/core/git'
import { mapLimit } from '@/util/concurrency'
import { PushlogError } from '@/util/errors'

export const CACHE_TTL_MS = 12 * 60 * 60 * 1000
const WALKERS = 16

/** Directories that hold no repositories worth reporting but are expensive to walk. */
const SKIPPED_DIRS = new Set([
  'node_modules',
  'Library',
  '.cache',
  '.treehouse',
  '.Trash',
  '.npm',
  '.pnpm-store',
  '.bun',
  '.sdkman',
  '.cargo',
  '.orbstack',
])

export function cacheDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.PUSHLOG_CACHE_DIR ?? join(env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'pushlog')
}

export interface DiscoverOptions {
  roots: string[]
  depth: number
  rescan: boolean
  cacheDir: string
  now?: number
  /** Called when a full scan is about to start (the cache was missing, stale or for other settings). */
  onScan?: () => void
}

interface CacheFile {
  key: string
  scannedAt: number
  repos: string[]
}

const cacheKey = (roots: string[], depth: number) => `${roots.join('|')}|${depth}`

async function readCache(file: string): Promise<CacheFile | null> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as Partial<CacheFile>
    if (
      typeof parsed.key === 'string' &&
      typeof parsed.scannedAt === 'number' &&
      Array.isArray(parsed.repos)
    ) {
      return parsed as CacheFile
    }
  } catch {}
  return null
}

/** Finds every directory containing a `.git` entry, up to `depth` levels below a root. */
async function findGitParents(roots: string[], depth: number): Promise<string[]> {
  const found: string[] = []

  /** Records `dir` when it holds a `.git`, and returns the subdirectories worth walking next. */
  const visit = async (dir: string, level: number): Promise<string[]> => {
    let entries: Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return [] // unreadable (permissions, vanished): skip
    }
    if (entries.some((e) => e.name === '.git')) found.push(dir)
    // A repo in a child of `dir` has its `.git` at level + 2, which must stay within `depth`.
    if (level + 2 > depth) return []
    return entries
      .filter((e) => e.isDirectory() && e.name !== '.git' && !SKIPPED_DIRS.has(e.name))
      .map((e) => join(dir, e.name))
  }

  let level = 0
  let current = depth >= 1 ? roots : []
  while (current.length > 0) {
    const currentLevel = level
    current = (await mapLimit(current, WALKERS, (dir) => visit(dir, currentLevel))).flat()
    level++
  }
  return found
}

export async function resolveRoots(roots: string[]): Promise<string[]> {
  const resolved = roots.length > 0 ? roots.map((r) => resolve(r)) : [homedir()]
  for (const root of resolved) {
    const info = await stat(root).catch(() => null)
    if (!info?.isDirectory()) throw new PushlogError(`Not a directory: ${root}`)
  }
  return resolved
}

/** Git directories of every repository under the roots (worktrees collapse into one), sorted. */
export async function discoverRepos(options: DiscoverOptions): Promise<string[]> {
  const file = join(options.cacheDir, 'repos.json')
  const key = cacheKey(options.roots, options.depth)
  const now = options.now ?? Date.now()

  if (!options.rescan) {
    const cached = await readCache(file)
    if (cached && cached.key === key && now - cached.scannedAt < CACHE_TTL_MS) return cached.repos
  }

  options.onScan?.()
  const parents = await findGitParents(options.roots, options.depth)
  const dirs = await mapLimit(parents, 8, (dir) => commonDir(dir))
  const repos = [...new Set(dirs.filter((d): d is string => d !== null))].sort()

  await mkdir(options.cacheDir, { recursive: true })
  await writeFile(file, JSON.stringify({ key, scannedAt: now, repos } satisfies CacheFile))
  return repos
}
