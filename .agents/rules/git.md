# Git Conventions

## Commit Message Format

Enforced by `lefthook.yml` commit-msg hook. Pattern:

```
<type>(<scope>): <subject>
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`, `ci`, `perf`, `build`, `revert` (Conventional Commits; non-standard types like `bugfix` are dropped by release-note tooling)

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

Bot-generated branches (`dependabot/*`, `renovate/*`) are exempt from this convention and are skipped by the `post-checkout` hook.

## Staging Rules

- **Never** use `git add -A` or `git add .` — stage specific files only
- **Never** commit `.env` files or any file containing secrets
- **Never** skip hooks (`--no-verify`)

## Pull Requests

- Keep PRs small and focused — one feature or fix per PR
- **PR title must follow the same format as commit messages:** `<type>(<scope>): <subject>` (lowercase after the colon, no trailing period, ≤ 100 chars). Scope is optional but preferred when the change is localized to one area. This is not enforced by a hook, so it must be applied manually/by the assistant when opening the PR.
- Reference the issue number in the PR title or body (e.g. `#414`)
- Run `pnpm lint` and `pnpm --filter <app> check-types` before opening a PR
- All user-facing strings must use `useTranslations()` — never hardcode labels

## After Merging

When a release is tagged, update `CHANGELOG.md` at the root following [Keep a Changelog](https://keepachangelog.com) format.
