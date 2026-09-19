# Published skills (skills.sh + ClawHub)

Each subdirectory here is a standalone skill package, published independently to two
external registries: [skills.sh](https://skills.sh) (Vercel's `npx skills`) and
[ClawHub](https://clawhub.ai) (OpenClaw). This file is maintainer documentation only — it is
not itself a skill and is not published.

| Skill | Mirrors | Registries |
|---|---|---|
| `chatbotx` | `apps/mcp-server` (MCP tool surface) | skills.sh, ClawHub |
| `chatbotx-cli` | `apps/cli/README.md` (CLI command surface) | skills.sh, ClawHub |

## Layout rule: never put a `SKILL.md` at the repository root

`npx skills` discovery shadows: "A `SKILL.md` discovered at a shallower level shadows
anything nested below it." A root-level `SKILL.md` hides every skill under `skills/` from a
plain `npx skills add ChatbotXIO/ChatbotX --list` — verified empirically against this repo:

```bash
# With a root SKILL.md present: --list reports only 1 skill (the root one).
# With no root SKILL.md: --list reports both `chatbotx` and `chatbotx-cli`.
npx skills add ChatbotXIO/ChatbotX --list
```

`scripts/check-skills.mjs` (run by `pnpm lint`) fails the build if a root `SKILL.md`
reappears. Do not add one back, even temporarily.

## skills.sh (Vercel `npx skills`)

No submission step — skills.sh indexes public GitHub repos directly and surfaces install
telemetry from the `skills` CLI. Once a `skills/<name>/SKILL.md` is committed to `main` on
`github.com/ChatbotXIO/ChatbotX`, anyone can install it:

```bash
npx skills add ChatbotXIO/ChatbotX --skill chatbotx-cli
npx skills add ChatbotXIO/ChatbotX --skill chatbotx
# or list everything this repo publishes:
npx skills add ChatbotXIO/ChatbotX --list
```

## ClawHub

```bash
npm i -g clawhub
clawhub login          # or: clawhub login --token <token> for CI
clawhub skill publish skills/chatbotx-cli --version <newVersion> [--changelog "..."]
clawhub skill publish skills/chatbotx --version <newVersion> [--changelog "..."]
```

Notes verified against ClawHub's documented behavior:

- Omitting `--version` publishes `1.0.0` for a brand-new skill, or the next patch version for
  an existing one — it does not read `version` from `SKILL.md` frontmatter. Pass `--version`
  explicitly and keep it equal to the frontmatter value so the two never drift.
- **A published version is reserved and cannot be republished with different content.** If a
  publish is rejected because the version already exists, bump the version instead of
  retrying.
- A new release can sit as `pending-publication` until ClawHub's moderation pass completes —
  do not assume a successful `clawhub skill publish` means the version is immediately
  installable.
- Rehearse with `clawhub skill publish <path> --dry-run --json` before a real publish.
- `license` is **not** a supported SKILL.md field — every skill on ClawHub is MIT-0
  unconditionally, so it is omitted from frontmatter here.
- `homepage` and `emoji` are top-level SKILL.md frontmatter fields, not nested under
  `metadata.openclaw`.
- ClawHub does not transfer a slug between accounts. `clawhub skill publish --migrate-owner`
  requires admin/owner access on both the source and destination accounts.

### CLI install and OpenClaw gating

Both skills declare `metadata.openclaw.requires.bins: [chatbotx]` and an `install` spec
(`kind: node`, `package: chatbotx`) so OpenClaw's Skills UI can offer to run
`npm i -g chatbotx`. This matters because **OpenClaw hides a skill from the agent entirely**
when a declared binary is missing from `PATH` — the `install` array only drives the
macOS Skills UI's own installer prompt, OpenClaw itself never auto-installs. Keep
`requires.bins` accurate: a skill that silently disappears because a rename slipped past this
field is a much harder bug to notice than a failed install.

Neither skill declares `requires.env` — the CLI also accepts `chatbotx config set` to persist
credentials to disk, so the environment variables are not a hard runtime requirement, only one
of two supported auth paths (documented via `envVars`/`primaryEnv` instead).

## Version policy

- `chatbotx` (this MCP skill) documents whatever the connected workspace's OpenAPI spec
  exposes at query time — its own `version` tracks doc revisions, not the API's version.
- `chatbotx-cli` is documented against a minimum `chatbotx` npm version (currently ≥ 1.8),
  noted in its `SKILL.md` "Setup" section. Bump that note, not the skill's own `version`,
  when only the referenced CLI version changes.
- When `apps/cli/README.md` gains a new command group, renamed command, or newly discovered
  command-name collision, mirror the change into `skills/chatbotx-cli/SKILL.md` and its
  `skill-card.md` risk list in the same change — see the `cli-mcp-docs` skill
  (`.agents/skills/cli-mcp-docs/SKILL.md`) for the full checklist.
- When the MCP server's default tool set changes, mirror the change into
  `skills/chatbotx/SKILL.md` — `apps/builder/__tests__/public-spec-mcp.test.ts` pins this file
  against the live default tool set and fails the build on drift.

## Publishing checklist

1. Update the skill's `SKILL.md` / `skill-card.md` content and bump `version` in frontmatter.
2. `node scripts/check-skills.mjs` — validates frontmatter shape and the no-root-`SKILL.md`
   rule.
3. `npx skills add "$PWD" --list` — confirm both skills are still listed by name.
4. `clawhub skill publish skills/<name> --version <version> --dry-run --json` — rehearse.
5. `clawhub skill publish skills/<name> --version <version> --changelog "..."` — publish for
   real.
6. Commit to `main` — skills.sh picks up the change with no separate submission step.
