import { describe, expect, it } from 'vitest'
import { parseRemote, webLinks } from '@/core/remote'

describe('parseRemote', () => {
  it.each([
    ['git@github.com:org/repo.git', 'github.com', 'org/repo'],
    ['git@github-work:org/repo', 'github-work', 'org/repo'],
    ['ssh://git@host.example:2222/org/repo.git', 'host.example', 'org/repo'],
    ['https://github.com/org/repo.git', 'github.com', 'org/repo'],
    [
      'https://user:token@gitlab.example.com/group/sub/repo.git/',
      'gitlab.example.com',
      'group/sub/repo',
    ],
    ['http://host/org/repo', 'host', 'org/repo'],
  ])('parses %s', (url, host, slug) => {
    expect(parseRemote(url)).toEqual({ host, slug })
  })

  it.each(['/srv/git/repo.git', '../relative/repo', 'file:///srv/repo.git', ''])(
    'returns null for %j',
    (url) => {
      expect(parseRemote(url)).toBeNull()
    },
  )
})

describe('webLinks', () => {
  it('builds GitHub-style links', () => {
    const links = webLinks({ host: 'github.com', slug: 'org/repo' })
    expect(links.repo).toBe('https://github.com/org/repo')
    expect(links.commit('abc123')).toBe('https://github.com/org/repo/commit/abc123')
    expect(links.branch('feature/x y')).toBe('https://github.com/org/repo/tree/feature/x%20y')
  })

  it('uses /-/ routes on GitLab hosts', () => {
    const links = webLinks({ host: 'gitlab.example.com', slug: 'g/r' })
    expect(links.commit('abc')).toBe('https://gitlab.example.com/g/r/-/commit/abc')
    expect(links.branch('main')).toBe('https://gitlab.example.com/g/r/-/tree/main')
  })

  it('uses commits/ on Bitbucket', () => {
    expect(webLinks({ host: 'bitbucket.org', slug: 'w/r' }).commit('abc')).toBe(
      'https://bitbucket.org/w/r/commits/abc',
    )
  })
})
