# pushlog

[![npm](https://img.shields.io/npm/v/pushlog)](https://www.npmjs.com/package/pushlog)
[![CI](https://img.shields.io/github/actions/workflow/status/favasconcelos/pushlog/ci.yml?branch=main&label=CI)](https://github.com/favasconcelos/pushlog/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/pushlog)](LICENSE)

Lists the commits you made across **every git repo on your machine**, and whether each one was pushed.
Handy for stand-ups, timesheets, and the "did I forget to push that?" moment at the end of the day.

```
$ pushlog yesterday
pushlog  Tue 2026-10-20   5 commits · 4 pushed · 1 local only · 2 active repos (of 183 scanned)

▸ reclaim-cli  favasconcelos/reclaim-cli  (3 commits, 3 pushed)
    22:41  a088432  ↑ 22:43   refactor!: rename the command to reclaim-cli  main
    23:52  5540b7c  ↑ 23:52   chore(release): 0.3.0  main
    ...

▸ notes  acme/notes  (2 commits, 1 pushed)
    09:14  3f9a1c2  ↑ 09:15   docs: add retro notes  main
    17:03  b71e0d4  ✗ local   wip: draft proposal  proposal
```

Each commit is marked:

| Mark | Meaning |
|---|---|
| `↑ 09:15` | pushed, and when (`↑ 10-21 08:02` when the push was on another day than the commit) |
| `↑ remote` | on a remote, but no push from this machine was recorded (pushed elsewhere, or older than the reflog) |
| `✗ local` | not on any remote |

Repo names, shas and branches are clickable links (OSC 8) in terminals that support them (iTerm2, Warp,
Ghostty, WezTerm, VS Code, kitty, …). GitHub, GitLab and Bitbucket URLs are supported, including `~/.ssh/config`
host aliases.

## Install

```sh
npm install -g pushlog
pushlog
```

Requires Node.js 20+ and `git`. To run from source instead: `npm ci && npm run build && npm link`.

## Usage

```
pushlog [date] [options]
```

`date` is `today` (default), `yesterday`, `YYYY-MM-DD`, or `N` for N days ago.

```sh
pushlog                          # today
pushlog yesterday
pushlog 3                        # three days ago
pushlog --days 7                 # the last 7 days, including today
pushlog --since 2026-10-01 --until 2026-10-15
pushlog -r ~/work -r ~/oss       # only scan these folders
pushlog --json | jq '.repos[].name'
```

| Option | |
|---|---|
| `--since <date>` / `--until <date>` | a range (each defaults to the date) |
| `--days <n>` | the last N days, including today |
| `-a, --author <email>` | also match commits by this author (repeatable) |
| `--all-authors` | do not filter by author |
| `-m, --merges` | include merge commits (hidden by default) |
| `-r, --root <dir>` | scan this folder instead of `$HOME` (repeatable) |
| `--depth <n>` | max directory depth to scan (default 6) |
| `--rescan` | refresh the cached repo list |
| `--json` | print the report as JSON |
| `--links` / `--urls` / `--plain` | force clickable links / print raw URLs / no links and no colors |

### Which commits are "yours"

Commits are matched by author email: your global `git config user.email`, each repo's own `user.email`
(so per-folder identities set with `includeIf` work), and any `--author` you add. Matching is a
case-insensitive literal comparison. A repo with no identity at all is skipped rather than showing everybody's
commits; use `--all-authors` to see them. All branches and tags are searched, not just the checked-out one;
stashes are ignored.

### How "pushed" is determined

Push times come from each repo's reflog: git records every update of a remote-tracking branch caused by
`git push` ("update by push"). A commit counts as pushed at the time of the earliest recorded push whose
tip contains it. Because reflogs are local, this only covers pushes made **from this machine**, for as long
as git keeps them (90 days by default). Commits that are on a remote without such a record show `↑ remote`.

### Repo discovery and cache

`pushlog` walks the roots (default `$HOME`) for `.git` entries, skipping `node_modules`, `Library`, `.cache`
and other heavy folders, and treats linked worktrees as their main repo. The list is cached for 12 hours in
`~/.cache/pushlog/repos.json` (`$XDG_CACHE_HOME` is honored; override with `PUSHLOG_CACHE_DIR`) and is rebuilt
when the roots or depth change. Use `--rescan` after cloning something new.

Repos are processed in parallel (8 at a time); change it with `PUSHLOG_JOBS`.

### Zsh completion

```sh
# in ~/.zshrc, after compinit
source <(pushlog completion zsh)
```

Completes dates, flags with descriptions, and folders for `--root`.

## Development

```sh
npm run dev         # rebuild on change
npm test            # vitest (uses real temporary git repos)
npm run typecheck
npm run lint        # biome
```

Layout: `src/core` (date parsing, repo discovery, git access, report building), `src/cli` (command and
rendering), `src/completion` (zsh script generation).

## Releasing

Releases are published to npm from GitHub with [trusted publishing](https://docs.npmjs.com/trusted-publishers)
(no npm token). The workflow is `.github/workflows/release.yml`.

```sh
npm version patch|minor|major        # bumps package.json, commits, tags vX.Y.Z
git push --follow-tags
gh release create vX.Y.Z --generate-notes
```

Publishing the GitHub Release triggers the workflow, which checks that the tag matches
`package.json`, runs lint, typecheck, tests and build, then runs `npm publish`. Mark the release as a
pre-release to publish it under the `next` dist-tag instead of `latest`.

## License

MIT
