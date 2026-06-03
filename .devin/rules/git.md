---
trigger: always_on
---

<!--
  SOURCE OF TRUTH: .agents/rules/git.md
  Do not edit here — update .agents/rules/git.md instead and keep this file in sync.
-->

# Git Conventions

## Commit Message Format

Enforced by `lefthook.yml` commit-msg hook. Pattern:

```
<type>(<scope>): <subject>
```

**Types:** `feat`, `fix`, `bugfix`, `refactor`, `docs`, `style`, `test`, `chore`, `ci`, `perf`, `build`, `revert`

**Examples:**
```
feat(auth): add OAuth2 login
fix: handle null response from API
chore(deps): bump next from 16.1.7 to 16.2.4
refactor(broadcast): remove reconcile sequence
```

- Subject must be ≤ 100 characters
- Use lowercase after the colon
- No period at the end

## Branch Naming

```
feat/<issue-or-description>
fix/<issue-or-description>
chore/<description>
refactor/<description>
```

Examples: `feat/instagram-channel`, `fix/whatsapp-webhook`

## Staging Rules

- **Never** use `git add -A` or `git add .` — stage specific files only
- **Never** commit `.env` files or any file containing secrets
- **Never** skip hooks (`--no-verify`)

## Pull Requests

- Keep PRs small and focused — one feature or fix per PR
- Reference the issue number in the PR title or body (e.g. `#414`)
- Run `pnpm lint` and `pnpm --filter <app> check-types` before opening a PR
- All user-facing strings must use `useTranslations()` — never hardcode labels

## After Merging

When a release is tagged, update `CHANGELOG.md` at the root following [Keep a Changelog](https://keepachangelog.com) format.
