---
description: Commit staged changes, push branch, and open a PR in one shot
allowed-tools: Bash, Read
---

Run `/commit` flow then push and open PR. Follows `.agents/rules/git.md`.

## Steps

1. **Commit** — follow `.claude/commands/commit.md` end-to-end (analyze diff, stage specific files, conventional `<type>(<scope>): <subject>`, HEREDOC, no `--no-verify`, no attribution). Abort if nothing to commit.

2. **Push** — parallel:
   - `git rev-parse --abbrev-ref HEAD` to get branch
   - `git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null` to check upstream
   - If no upstream: `git push -u origin <branch>`; else `git push`
   - Never force-push. Never push to `main`/`master` directly.

3. **PR** — parallel:
   - `git log main..HEAD --oneline` for commit list
   - `git diff main...HEAD --stat` for scope
   - `gh pr view --json url 2>/dev/null` to detect existing PR (skip create if present, return URL)

4. **Draft PR body**:
   - Title: same as commit subject (≤ 100 chars). Add `#<issue>` if `$ARGUMENTS` contains issue ref.
   - Body sections: `## Summary` (1–3 bullets, why), `## Changes` (key files/modules), `## Test plan` (markdown checklist).

5. **Create PR** against `main`:
   ```bash
   gh pr create --base main --title "<title>" --body "$(cat <<'EOF'
   ## Summary
   - ...

   ## Changes
   - ...

   ## Test plan
   - [ ] pnpm lint
   - [ ] pnpm --filter <app> check-types
   - [ ] manual verification
   EOF
   )"
   ```

6. Return PR URL.

## Arguments

$ARGUMENTS — optional issue ref / hint (e.g. `#414 flow token`). Used in PR title/body when present.

## Guardrails

- No `git add -A`/`.`, no `.env`, no secrets.
- No `--no-verify`, no `--force`/`--force-with-lease` unless user explicitly asks.
- No attribution footers.
- If branch is `main`/`master`: abort and tell user to create feature branch first.
- If `pnpm lint` or typecheck obviously broken in diff, warn before pushing (do not auto-run unless asked).
