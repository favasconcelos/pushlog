import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach } from 'vitest'
import { formatDay } from '@/core/dates'
import type { ReportOptions } from '@/core/types'

const created: string[] = []

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

export async function tempDir(): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'pushlog-test-')))
  created.push(dir)
  return dir
}

export function git(cwd: string, ...args: string[]): string {
  return gitEnv(cwd, {}, ...args)
}

export function gitEnv(cwd: string, env: Record<string, string>, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  })
}

export const ME = 'me@test.dev'

export function initRepo(dir: string, email = ME): void {
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', email)
  git(dir, 'config', 'user.name', 'Test')
}

/** A local day at 10:00, `days` days ago. */
export function at(days: number, hour = 10, minute = 0): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, hour, minute)
}

export const dayAgo = (days: number) => formatDay(at(days))

/** Commits a new file with the given message, authored and committed at `when`. */
export async function commit(
  dir: string,
  message: string,
  when: Date,
  author: { email: string; name?: string } = { email: ME },
  options: { allowEmpty?: boolean } = {},
): Promise<string> {
  const file = `${message.replace(/\W+/g, '-')}.txt`
  await mkdir(dirname(join(dir, file)), { recursive: true })
  await writeFile(join(dir, file), `${message}\n`)
  git(dir, 'add', '-A')
  const iso = when.toISOString()
  execFileSync(
    'git',
    ['commit', '-q', ...(options.allowEmpty ? ['--allow-empty'] : []), '-m', message],
    {
      cwd: dir,
      stdio: 'ignore',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: author.name ?? 'Test',
        GIT_AUTHOR_EMAIL: author.email,
        GIT_COMMITTER_NAME: author.name ?? 'Test',
        GIT_COMMITTER_EMAIL: author.email,
        GIT_AUTHOR_DATE: iso,
        GIT_COMMITTER_DATE: iso,
      },
    },
  )
  return git(dir, 'rev-parse', 'HEAD').trim()
}

export function reportOptions(day: string, overrides: Partial<ReportOptions> = {}): ReportOptions {
  return {
    since: day,
    until: day,
    authors: [ME],
    allAuthors: false,
    merges: false,
    jobs: 2,
    ...overrides,
  }
}
