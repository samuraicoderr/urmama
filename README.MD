# urmama

urmama is a Node.js CLI tool for rewriting the full commit history of a Git branch so that every commit falls within a chosen date window while preserving the original order of commits.

It is especially useful for re-timing a branch for a hackathon, project sprint, or other date-based workflow without changing the commit contents themselves.

## Features

- Rewrites an entire branch history from the root commit to HEAD
- Preserves commit order and message content
- Supports three distribution strategies:
  - randomise (default)
  - equalize
  - greedyMum
- Writes to a new branch by default, or rewrites the target branch in place when requested
- Optionally force-pushes the rewritten branch to a remote
- Enforces safety checks such as valid date range, existing target branch, and clean working tree

## Installation

Install globally with npm:

```bash
npm install -g urmama
```

## Usage

```bash
urmama \
  --starts "YYYY-MM-DD HH:mm" \
  --ends "YYYY-MM-DD HH:mm" \
  [options]
```

### Required arguments

- --starts: start datetime (inclusive)
- --ends: end datetime (inclusive)

### Optional arguments

- --targetBranch <name>: branch to rewrite; defaults to the current active branch
- --destBranch <name>: branch that will receive the rewritten history
- --useTargetAsDest [true|false]: rewrite the target branch in place instead of creating a copy
- --mode <mode>: distribution strategy; one of randomise, equalize, greedyMum
- --forcePushTo <remote>: force-push the rewritten branch after completion
- --help, -h: show usage information

## Distribution modes

### randomise (default)

Distributes commits randomly across the available days while keeping their original relative order.

### equalize

Spreads commits as evenly as possible across the date range.

### greedyMum

Preserves commits already inside the requested range and only adjusts commits that fall outside it. This mode is deterministic and is designed to avoid moving commits unnecessarily.

## Examples

### 1. Create a rewritten copy of the current branch

```bash
urmama \
  --starts "2026-06-01 09:00" \
  --ends "2026-06-04 18:00"
```

This creates a new branch named like currentBranch-Copy.

### 2. Rewrite the main branch in place

```bash
urmama \
  --starts "2026-06-01 09:00" \
  --ends "2026-06-04 18:00" \
  --targetBranch "main" \
  --useTargetAsDest true
```

### 3. Backup, rewrite, and force-push

```bash
urmama \
  --starts "2026-06-01 09:00" \
  --ends "2026-06-04 18:00" \
  --targetBranch "main" \
  --destBranch "main-backup" \
  --useTargetAsDest true \
  --forcePushTo "origin"
```

## Safety and requirements

Before rewriting history, urmama checks that:

- you are inside a Git repository
- the target branch exists
- the working tree has no uncommitted changes
- --starts occurs before --ends

Because this tool rewrites history, it is safest to use it on a backup branch or a disposable branch first. When --useTargetAsDest is enabled, the tool will warn you before rewriting the target branch in place.

## Development

Run the test suite:

```bash
npm test
```

## Notes

This project uses Git’s native CLI to rebuild commit history and updates both the author and committer dates for rewritten commits.
