# URMAMA – Product Requirements Document (PRD)

## 1. Overview

**Product Name:** `urmama`  
**Type:** Node.js CLI Tool  
**Distribution:** Published to npm, installable globally  
**Primary Use Case:** Rewrite the full commit history of a Git branch so that all commits fall within a specified date range while preserving commit order.

Example install:

```bash
npm install -g urmama
```

Example publish:

```bash
make push-update
```

---

## 2. Purpose

`urmama` enables developers to rewrite Git commit history so that all commits fit within a specified time window.

Primary motivation:
- Re-distribute commits across a specified hackathon or project date range.
- Maintain original commit order.
- Offer deterministic or randomized distribution strategies.
- Optionally rewrite the existing branch or generate a new branch.
- Optionally force push rewritten history to a remote.

---

## 3. Goals

- Rewrite **entire commit history** of a branch.
- Ensure all rewritten commits fall between:
  - `--starts`
  - `--ends`
- Preserve original commit order.
- Provide three distribution modes:
  - `randomise`
  - `equalize`
  - `greedyMum`
- Provide safe branch handling defaults.
- Provide optional automatic force push.

---

## 4. Non-Goals

- No partial history rewrites (always full branch history).
- No interactive UI (CLI only).
- No GUI.
- No commit content modification.
- No timezone conversion logic beyond system Git handling.

---

## 5. CLI Interface

### Command Format

```bash
urmama \
  --starts "YYYY-MM-DD HH:mm" \
  --ends "YYYY-MM-DD HH:mm" \
  --targetBranch "main" \
  --destBranch "main-Copy" \
  --useTargetAsDest \
  --mode "randomise|equalize|greedyMum" \
  --forcePushTo "origin"
```

---

## 6. CLI Arguments

### Required

- `--starts`
  - Start datetime (inclusive).
- `--ends`
  - End datetime (inclusive).

### Optional

#### `--targetBranch`
- Branch to rewrite.
- Defaults to current active branch.

#### `--destBranch`
- Branch that will contain rewritten commits.
- Default behavior:
  - If not specified:
    ```
    "{targetBranch}-Copy"
    ```
  - If that already exists:
    ```
    "{targetBranch}-Copy_{randomID}"
    ```
    Example:
    ```
    main-Copy_djkfk34df
    ```

#### `--useTargetAsDest`
- Boolean.
- Default: `false`.

Behavior:

| Condition | Behavior |
|------------|----------|
| false | Rewrite into destination branch |
| true + no `--destBranch` | Rewrite history directly on target branch |
| true + `--destBranch` specified | Copy `targetBranch` to `destBranch` first (backup), then rewrite `targetBranch` |

---

#### `--mode`

Default: `"randomise"`

Allowed values:

- `randomise`
- `equalize`
- `greedyMum`

---

#### `--forcePushTo`

- Remote name (e.g., `origin`)
- If provided:
  - Perform `git push --force <remote> <branch>` after rewrite completes.
- If not provided:
  - No push occurs.

---

## 7. Core Functional Behavior

### 7.1 Commit Collection

- Collect all commits from the root of the branch to HEAD.
- Preserve original commit order (chronological order as in Git history).

---

## 8. Date Range Handling

Let:

- `S = start datetime`
- `E = end datetime`
- Range must satisfy: `S < E`

Compute:

- Total days between S and E (inclusive by calendar day).
- Commits will be distributed across those days.

---

## 9. Distribution Modes

---

# 9.1 Equalize Mode

### Description

Distribute commits evenly across all days in the range.

### Algorithm

1. Compute total commits: `N`
2. Compute total days in range: `D`
3. Compute:
   ```
   base = floor(N / D)
   remainder = N % D
   ```

4. For each day:
   - Assign `base` commits.
   - Distribute remaining commits (`remainder`) one-by-one to earliest days.

5. Commits remain in original order.

Example:

- 20 commits
- 4 days

Each day gets:
- 5 commits per day

---

# 9.2 Randomise Mode (Default)

### Description

Distribute commits randomly across the available days while preserving commit order.

### Rules

- All commits must remain between `S` and `E`.
- Each day may receive any number of commits.
- Total assigned commits = N.
- Order of commits preserved.

### Algorithm

- Randomly partition N into D buckets.
- Ensure:
  - Sum of buckets = N
  - Buckets may be zero.
- Assign commits sequentially according to generated bucket sizes.

---

# 9.3 GreedyMum Mode

### Description

Preserve commits already inside the range. Only adjust commits outside the range.

If all commits are already within `[S, E]`, **do nothing**.

---

### 9.3.1 Rules

Define:

- `S` = start datetime
- `E` = end datetime

Define buffer windows:

- First hour window:
  ```
  [S, S + 1 hour]
  ```

- Last hour window:
  ```
  [E - 1 hour, E]
  ```

---

### Behavior

#### Case A: Commit before S

- Move to first day (date of S).
- Must be placed BEFORE commits already in first day.
- Use the reserved 1-hour buffer space.

If commits already exist inside `[S, S + 1 hour]`:
- Nudge them inward (after the 1-hour window)
- Maintain relative order.

---

#### Case B: Commit after E

- Move to last day (date of E).
- Must be placed AFTER commits already in last day.
- Use the reserved 1-hour ending buffer.

If commits exist inside `[E - 1 hour, E]`:
- Nudge them inward (before the 1-hour window)
- Maintain relative order.

---

#### Case C: Commit inside [S, E]

- Leave unchanged.

---

### Important Guarantees

- No commit ends outside `[S, E]` after rewrite.
- Original relative order preserved.
- No timestamp collisions.
- At least 1-minute separation between commits if needed.

---

## 10. Timestamp Assignment

Within each assigned day:

- Distribute commits chronologically within:
  ```
  00:00 → 23:59
  ```
- Ensure:
  - Strictly increasing timestamps.
  - No identical timestamps.
  - Minimum 1-minute delta if necessary.

For greedyMum buffer zones:
- Reserve:
  - First hour for nudged earlier commits.
  - Last hour for nudged later commits.

---

## 11. Branch Handling Logic

### Default (Safe Mode)

- New branch created.
- Original branch untouched.

---

### Rewrite Target Branch

If:

```
--useTargetAsDest true
```

Then:

- Rewrite target branch in place.

If:

```
--useTargetAsDest true AND --destBranch provided
```

Then:

1. Create backup branch from target.
2. Rewrite target branch.

---

## 12. Force Push Behavior

If `--forcePushTo origin` provided:

After rewrite completes:

```bash
git push --force origin <rewrittenBranch>
```

No automatic push unless explicitly specified.

---

## 13. Error Handling

Tool must fail if:

- `--starts` missing.
- `--ends` missing.
- `starts >= ends`
- Target branch does not exist.
- Not inside a Git repository.
- Working directory has uncommitted changes.

---

## 14. Safety Warnings

Before rewriting:

- Display warning:
  - History will be rewritten.
  - Force push may be required.
- If rewriting target branch:
  - Explicit confirmation prompt unless `--yes` flag (future extension).

---

## 15. Implementation Requirements

- Language: Node.js
- Use native Git CLI commands.
- Rewrite mechanism:
  - `git filter-repo` (preferred) OR
  - `git rebase --rebase-merges --root`
- Preserve:
  - Commit message
  - Author name
  - Author email
  - Commit content
- Rewrite:
  - Author date
  - Commit date

Set both:

```
GIT_AUTHOR_DATE
GIT_COMMITTER_DATE
```

---

## 16. Determinism

- `equalize` must be deterministic.
- `randomise` should optionally support future `--seed` flag.
- `greedyMum` must be deterministic.

---

## 17. Example Usages

### Example 1 – Default Behavior

```bash
urmama \
  --starts "2026-06-01 09:00" \
  --ends "2026-06-04 18:00"
```

Result:
- Rewrites current branch
- Creates: `currentBranch-Copy`

---

### Example 2 – Rewrite Main In Place

```bash
urmama \
  --starts "2026-06-01 09:00" \
  --ends "2026-06-04 18:00" \
  --targetBranch "main" \
  --useTargetAsDest true
```

---

### Example 3 – Backup Then Rewrite + Force Push

```bash
urmama \
  --starts "2026-06-01 09:00" \
  --ends "2026-06-04 18:00" \
  --targetBranch "main" \
  --destBranch "main-backup" \
  --useTargetAsDest true \
  --forcePushTo "origin"
```

---

## 18. Success Criteria

- All rewritten commits fall strictly inside `[S, E]`.
- No commits lost.
- Order preserved.
- Branch handling behaves exactly as specified.
- Force push only when requested.
- Zero ambiguity in behavior.
