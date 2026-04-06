---
name: github-search
description: Search GitHub for high-quality repos — skills, templates, code examples, libraries. Use when the user asks to find repos, skills, templates, boilerplates, or code examples on GitHub.
allowed-tools: Bash
---

# GitHub Search

You search GitHub using the `gh` CLI (at `/opt/homebrew/bin/gh`) to find high-quality repositories matching what the user needs.

## When triggered

The user provides $ARGUMENTS describing what they're looking for — a skill, template, boilerplate, code example, library, or any type of repo.

## Steps

### 1. Build search queries

Construct 2–4 varied `gh search repos` queries from $ARGUMENTS. Vary phrasing and keywords to cast a wider net. Always sort by stars.

```
/opt/homebrew/bin/gh search repos "<query>" --sort stars --limit 10 --json name,owner,description,stargazersCount,updatedAt,url
```

Run all queries in parallel.

### 2. Deduplicate and shortlist

Merge results from all queries. Remove duplicates by owner/name. Drop repos with 0 stars. Rank the top 5–8 candidates by star count.

### 3. Verify each candidate

For each shortlisted repo, run these checks in parallel:

```
/opt/homebrew/bin/gh repo view <owner>/<repo> --json stargazerCount,pushedAt,description,url,licenseInfo
/opt/homebrew/bin/gh api 'repos/<owner>/<repo>' --jq '{topics: .topics, license: .license.spdx_id, open_issues: .open_issues_count, forks: .forks_count, archived: .archived}'
```

Score each repo on these signals:

| Signal | Strong | Weak |
|---|---|---|
| Stars | 100+ | < 10 |
| Last pushed | Within 30 days | > 6 months ago |
| License | MIT, Apache-2.0, ISC | None or restrictive |
| Forks | 10+ | 0 |
| Archived | false | true (disqualify) |
| Open issues | < 50 or actively triaged | 100+ with no activity |
| Topics/tags | Present and relevant | Missing |

Disqualify archived repos. Deprioritize repos with no license or last push > 6 months ago.

### 4. Spot-check top 3

For the top 3 candidates, check repo structure for quality signals:

```
/opt/homebrew/bin/gh api 'repos/<owner>/<repo>/git/trees/main?recursive=1' --jq '.tree[].path' | head -50
```

Look for:
- **Tests**: `test/`, `tests/`, `__tests__/`, `spec/`, `evals/`, `*.test.*`, `*.spec.*`
- **Docs**: `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, docs folder
- **CI**: `.github/workflows/`, `.circleci/`, `.travis.yml`
- **Structure**: Clean organization, not a single-file dump

Also check recent commit activity:

```
/opt/homebrew/bin/gh api 'repos/<owner>/<repo>/commits?per_page=5' --jq '.[] | "\(.commit.committer.date) \(.commit.message | split("\n")[0])"'
```

### 5. Present results

Return a ranked list. For each repo include:

- **Name** with URL
- **Stars** / **Forks** / **License**
- **Last pushed** date
- **Description** (from repo)
- **Quality notes** — tests, CI, docs, structure, commit activity
- Any concerns (stale, no tests, no license, etc.)

Keep it concise. Lead with the recommendation, then the table.

## Input

$ARGUMENTS
