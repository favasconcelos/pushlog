export type CommitStatus = 'pushed' | 'remote' | 'local'

export interface CommitEntry {
  sha: string
  fullSha: string
  /** Committer time, ms since epoch. */
  committedAt: number
  subject: string
  /** Branch (or tag) the commit was found on. */
  branch: string
  /**
   * `pushed`: a push from this machine was recorded. `remote`: it is on a remote, but no push was
   * recorded here. `local`: not on any remote.
   */
  status: CommitStatus
  /** Time of the earliest recorded push containing the commit, ms since epoch. */
  pushedAt: number | null
  url: string | null
  branchUrl: string | null
}

export interface RepoReport {
  name: string
  gitDir: string
  /** `org/repo`, when the remote could be parsed. */
  slug: string | null
  url: string | null
  commits: CommitEntry[]
}

export interface ReportTotals {
  commits: number
  pushed: number
  local: number
  activeRepos: number
  scannedRepos: number
}

export interface Report {
  /** First day, YYYY-MM-DD. */
  since: string
  /** Last day, YYYY-MM-DD. */
  until: string
  repos: RepoReport[]
  totals: ReportTotals
}

export interface ReportOptions {
  since: string
  until: string
  authors: string[]
  allAuthors: boolean
  merges: boolean
  jobs: number
}
