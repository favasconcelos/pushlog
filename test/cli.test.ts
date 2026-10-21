import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildProgram } from '@/program'
import { at, commit, dayAgo, git, initRepo, tempDir } from './helpers'

let out = ''
let err = ''

beforeEach(() => {
  out = ''
  err = ''
  process.exitCode = undefined
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    out += String(chunk)
    return true
  })
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    err += `${args.join(' ')}\n`
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  process.exitCode = undefined
})

async function pushlog(...args: string[]) {
  const program = buildProgram()
  program.exitOverride()
  await program.parseAsync(args, { from: 'user' })
}

async function workspace() {
  const root = await tempDir()
  vi.stubEnv('PUSHLOG_CACHE_DIR', await tempDir())
  const repo = join(root, 'proj')
  git(root, 'init', '-q', '-b', 'main', repo)
  initRepo(repo)
  await commit(repo, 'did something', at(1))
  return { root, repo }
}

describe('pushlog', () => {
  it("reports yesterday's commits for a given root", async () => {
    const { root } = await workspace()

    await pushlog('yesterday', '-r', root, '-a', 'me@test.dev', '--plain')

    expect(out).toContain(`1 commit · 0 pushed · 1 local only · 1 active repo (of 1 scanned)`)
    expect(out).toMatch(/▸ proj {2}\(1 commit, 0 pushed\)/)
    expect(out).toMatch(/✗ local {3}did something {2}main/)
    expect(process.exitCode).toBeUndefined()
  })

  it('accepts N days ago, an ISO date and ranges', async () => {
    const { root } = await workspace()

    await pushlog('1', '-r', root, '--plain')
    expect(out).toContain('1 commit')

    out = ''
    await pushlog(dayAgo(1), '-r', root, '--plain')
    expect(out).toContain('1 commit')

    out = ''
    await pushlog('--days', '3', '-r', root, '--plain')
    expect(out).toContain(`${dayAgo(2)} → ${dayAgo(0)}`)
    expect(out).toContain('1 commit')

    out = ''
    await pushlog('today', '-r', root, '--plain')
    expect(out).toContain('Nothing found for this period.')
  })

  it('prints JSON', async () => {
    const { root } = await workspace()

    await pushlog('yesterday', '-r', root, '--json')

    const parsed = JSON.parse(out)
    expect(parsed.totals).toMatchObject({ commits: 1, local: 1 })
    expect(parsed.repos[0].commits[0]).toMatchObject({ subject: 'did something', status: 'local' })
  })

  it.each([
    [['nonsense'], /Invalid date "nonsense"/],
    [['--days', '0'], /--days must be a positive integer/],
    [['--days', '2', 'yesterday'], /--days cannot be combined/],
    [['--since', 'today', '--until', 'yesterday'], /--since is after --until/],
    [['--depth', 'x'], /--depth must be a positive integer/],
    [['-r', '/definitely/not/here'], /Not a directory/],
  ])('fails cleanly for %j', async (args, message) => {
    vi.stubEnv('PUSHLOG_CACHE_DIR', await tempDir())

    await pushlog(...args)

    expect(err).toMatch(message)
    expect(err).toMatch(/^pushlog: /)
    expect(process.exitCode).toBe(1)
    expect(out).toBe('')
  })

  it('prints the zsh completion script', async () => {
    await pushlog('completion', 'zsh')
    expect(out).toContain('#compdef pushlog')

    out = ''
    await pushlog('completion', 'fish')
    expect(err).toContain('Only zsh is supported')
    expect(process.exitCode).toBe(1)
  })
})
