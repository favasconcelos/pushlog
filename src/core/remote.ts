import { run } from '@/util/exec'

export interface RemoteInfo {
  host: string
  slug: string
}

/**
 * git@host:org/repo.git | ssh://git@host/org/repo.git | https://host/org/repo.git
 * to the host and `org/repo`. Local paths and unknown shapes return null.
 */
export function parseRemote(url: string): RemoteInfo | null {
  let host: string
  let path: string
  const scheme = /^(ssh|https?):\/\/(?:[^@/]*@)?([^/]+)\/(.+)$/.exec(url)
  if (scheme) {
    host = scheme[2] as string
    path = scheme[3] as string
  } else {
    const scp = /^[^@/\s]+@([^:/\s]+):(.+)$/.exec(url)
    if (!scp) return null
    host = scp[1] as string
    path = scp[2] as string
  }
  host = host.replace(/:\d*$/, '')
  path = path.replace(/\/+$/, '').replace(/\.git$/, '')
  return host && path ? { host, slug: path } : null
}

export interface WebLinks {
  repo: string
  commit: (sha: string) => string
  branch: (name: string) => string
}

/** Browser URLs for a repository on a known git host. GitLab uses `/-/` routes, Bitbucket `commits`. */
export function webLinks({ host, slug }: RemoteInfo): WebLinks {
  const repo = `https://${host}/${slug}`
  const commitPath = host.includes('gitlab')
    ? '-/commit'
    : host.includes('bitbucket')
      ? 'commits'
      : 'commit'
  const treePath = host.includes('gitlab') ? '-/tree' : 'tree'
  const encode = (name: string) => name.split('/').map(encodeURIComponent).join('/')
  return {
    repo,
    commit: (sha) => `${repo}/${commitPath}/${sha}`,
    branch: (name) => `${repo}/${treePath}/${encode(name)}`,
  }
}

/** Resolves ~/.ssh/config aliases (e.g. github-work to github.com), once per host. */
export function createHostResolver(): (host: string) => Promise<string> {
  const cache = new Map<string, Promise<string>>()
  const resolve = async (host: string) => {
    const result = await run('ssh', ['-G', host], { timeoutMs: 5_000 })
    const line = result.stdout.split('\n').find((l) => l.startsWith('hostname '))
    return line?.slice('hostname '.length).trim() || host
  }
  return (host) => {
    let pending = cache.get(host)
    if (!pending) {
      pending = resolve(host)
      cache.set(host, pending)
    }
    return pending
  }
}
