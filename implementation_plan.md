# URMAMA CLI Implementation Plan

`urmama` is a Node.js CLI tool that rewrites the commit history of a Git branch so that all commits fit within a specified date range, preserving their chronological order and using one of three distribution strategies: `randomise`, `equalize`, or `greedyMum`.

## Proposed Design & Architecture

Rather than using complex external libraries or rewriting files in the working directory, we will implement history rewriting using **Git plumbing commands** (`git commit-tree`). This approach is:
- **Fast and efficient**: It does not touch the index or working tree during rewrite, avoiding file conflicts and slow disk operations.
- **Reliable**: It guarantees that commit trees, author details, commit messages, and merge relationships are preserved exactly.
- **Conflict-free**: Since it processes the commits inside Git's database directly, there are no merge conflicts or checkout/cherry-pick errors.

---

## Proposed Changes

We will create a structured Node.js package with zero external dependencies to ensure ease of global installation.

### [NEW] [package.json](file:///c:/Users/Us/Desktop/code/urmama/package.json)
Configure the npm package metadata, entry points, and scripts.
- Type: `commonjs` for maximum node compatibility.
- Executable bin mapping: `"bin": { "urmama": "./bin/urmama.js" }`.
- Scripts: `test` to run verification checks.

### [NEW] [bin/urmama.js](file:///c:/Users/Us/Desktop/code/urmama/bin/urmama.js)
The entry point of the CLI application. It will:
- Check environment: verify in Git worktree and check for uncommitted changes.
- Parse command line arguments.
- Call the rewriting engine.
- Ask for user confirmation when modifying target branch in-place.
- Perform the Git reference update and optional force push.

### [NEW] [lib/git.js](file:///c:/Users/Us/Desktop/code/urmama/lib/git.js)
A utility layer executing synchronous Git CLI commands via `child_process.execSync`.
Functions:
- `isInsideGitWorktree()`
- `hasUncommittedChanges()`
- `getCurrentBranch()`
- `branchExists(branchName)`
- `getCommitsReverse(branchName)`
- `getCommitDetails(hash)`
- `createCommitTree(treeHash, parents, authorName, authorEmail, authorDate, committerName, committerEmail, committerDate, message)`
- `updateBranchRef(branchName, commitHash)`
- `resetHard(commitHash)`
- `copyBranch(src, dest)`
- `forcePush(remote, branchName)`

### [NEW] [lib/date.js](file:///c:/Users/Us/Desktop/code/urmama/lib/date.js)
Handles date calculations, timezone-aware formatting, and time spacing within windows.
Functions:
- `parseDateTime(str)`: Parses `"YYYY-MM-DD HH:mm"` into local Date object.
- `toLocalISOString(date)`: Formats Date into ISO 8601 with local timezone offset.
- `getCalendarDaysCount(S, E)`: Calculates days between S and E inclusive.
- `getDayWindow(dayIndex, totalDays, S, E)`: Returns `{ start, end }` windows for each calendar day.
- `distributeCommitsInWindow(startTime, endTime, count)`: Generates strictly increasing timestamps inside a window.

### [NEW] [lib/modes.js](file:///c:/Users/Us/Desktop/code/urmama/lib/modes.js)
Implements the distribution logic for the three modes:
- `equalize(N, D)`: Deterministic partition where remainder is given to early days.
- `randomise(N, D)`: Randomly partitions N into D buckets using sorted random boundaries.
- `greedyMum(commits, S, E)`: Computes custom dates preserving inside commits and nudging outside commits to the boundaries.

---

## Verification Plan

We will create a verification test suite in `tests/urmama.test.js` to ensure the algorithms and logic are correct.

### Automated Tests
We can run the test suite using standard Node:
```bash
node tests/urmama.test.js
```
The test suite will check:
- Date parsing and timezone formatting.
- `equalize` and `randomise` partition counts and distributions.
- `greedyMum` edge cases:
  - Commits before S.
  - Commits after E.
  - Commits inside `[S, E]`.
  - Buffer nudge logic and relative order validation.

### Manual Verification
1. Initialize a test git repository.
2. Create dummy commits.
3. Run the CLI tool with various flag combinations.
4. Verify the dates of the output branch using `git log --pretty=fuller`.
