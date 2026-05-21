---
description: Stage specific files and create a conventional commit following ChatbotX git rules
allowed-tools: Bash, Read
---

Create a git commit for the current changes following the ChatbotX conventions in `.agents/rules/git.md`.

## Steps

1. Run in parallel:
   - `git status` (never `-uall`)
   - `git diff` (staged + unstaged)
   - `git log -n 10 --oneline` for style reference

2. Analyze the diff:
   - Determine commit `type`: `feat`, `fix`, `bugfix`, `refactor`, `docs`, `style`, `test`, `chore`, `ci`, `perf`, `build`, `revert`
   - Determine `scope` from touched package/app/feature when obvious (e.g. `builder`, `worker`, `whatsapp`, `database`)
   - Draft subject: `<type>(<scope>): <subject>` — ≤ 100 chars, lowercase after `:`, no trailing period
   - Add body only when the *why* is non-obvious

3. Stage **specific files only** — never `git add -A` or `git add .`.
   - Skip `.env*` and any file containing secrets. Warn if user explicitly requests them.

4. Commit using a HEREDOC so formatting is preserved:
   ```bash
   git commit -m "$(cat <<'EOF'
   <type>(<scope>): <subject>

   <optional body>
   EOF
   )"
   ```
   - Do **not** pass `--no-verify`. Let `lefthook` commit-msg + pre-commit hooks run.
   - If a hook fails, fix the underlying issue and create a **new** commit (do not `--amend`).

5. Run `git status` after commit to confirm clean state.

## Arguments

$ARGUMENTS — optional. Treat as a hint about scope/intent (e.g. `flow token fallback`). Still derive type/scope from the diff.

## Guardrails

- No attribution / `Co-Authored-By` footers (disabled globally).
- No pushing in this command — use `/pr` for that.
- If nothing is staged and there are no changes, abort without creating an empty commit.
