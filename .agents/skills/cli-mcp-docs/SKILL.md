---
name: cli-mcp-docs
description: Use after adding, renaming, or removing a public oRPC procedure, or after changing an operation's MCP visibility. The CLI and MCP server generate their surface at runtime from the live OpenAPI spec, but four hand-maintained doc files drift. This skill lists what to check and update in each, plus how to catch a silent CLI command-name collision before it ships.
---

# CLI & MCP docs sync (ChatbotX)

`apps/cli` and `apps/mcp-server` never need a code change for a normal new
endpoint — they both fetch `GET /api/public-spec.json` (generated from
`publicRouter`, see the `orpc-api` skill) and derive their command/tool
surface from it at runtime, cached for an hour. What does **not** update
itself is the human-facing documentation that describes that surface. Skipping
this after a public API change is how the docs quietly drift from what
`chatbotx --help` / `tools/list` actually returns.

## 1. Confirm the operation is live and named right

Before touching any doc, verify the new/changed operation in the generated
spec:

```bash
pnpm --filter builder test -- public-spec-operations.test.ts public-spec-mcp.test.ts
```

Check:
- `operationId` is what you expect — it becomes the MCP tool name
  (`toSnakeCase(operationId)` in `apps/mcp-server/src/openapi-loader.ts`).
- `summary`/`description` read well standalone — `buildToolDescription` joins
  them verbatim into the MCP tool description an LLM sees.
- If the endpoint should appear in the MCP default connection payload, its
  route sets `spec: mcpSpec({ visibility: "default" })` (see `orpc-api`
  skill) — otherwise it's reachable only via the `search_tools`/`call_tool`
  meta-tools.

## 2. Check for a silent CLI command-name collision

The CLI derives command names from `{path, method}` alone via
`pathAndMethodToCommandName` (`apps/cli/src/openapi-loader.ts`) — it does not
see `operationId`. Two operations under the same resource can reduce to the
same name; `toolsToCommands` keeps the first registered and **silently drops
the second** (stderr warning, exit code 0 — easy to miss in CI).

```bash
pnpm --filter chatbotx test                              # pins known collisions,
                                                          # apps/cli/__tests__/openapi-loader-command-names.test.ts
CHATBOTX_API_URL=<local-builder-url>/api \
  pnpm --filter chatbotx dev:cli -- --refresh-spec <group> --help
```

Watch stderr for `Warning: duplicate command name "..." — skipping`. If your
new endpoint collides with an existing command, you have two choices: rename
one side's path/verb so the derived names differ, or accept the collision and
document it (step 3). The MCP server does not have this problem — its tool
names come from the (test-enforced-unique) `operationId`, not a path/method
heuristic.

## 3. Update the four hand-maintained files

Do all that apply — a partial update is worse than none, because the files
disagree with each other:

| File | What lives here | Update when |
|---|---|---|
| `apps/cli/README.md` | Full command reference by resource group, plus the "Known command-name collisions" section | A command group is added/renamed, or step 2 found a new collision |
| `skills/chatbotx-cli/SKILL.md` | Condensed ClawHub/skills.sh-published mirror of the README (command groups + collision table + tips for agents) | Same triggers as README — keep both in sync |
| `skills/chatbotx-cli/skill-card.md` | ClawHub skill card — risk list references the collision table | A collision changes the "Known Risks" section's specifics |
| `skills/chatbotx/SKILL.md` | CLI Commands mirror, "MCP Tools" category table, curated default-tool-set description | A `visibility: "default"` operation is added/removed/recategorized |

Mechanics for both published packages (`skills/chatbotx-cli/`, `skills/chatbotx/`):
bump `version` in `SKILL.md`'s frontmatter on every content change; for
`chatbotx-cli` that's the only version to bump — `skill-card.md` no longer
carries its own version line. Both packages must stay directly under
`skills/<name>/SKILL.md` — never add a `SKILL.md` at the repository root, which
shadows both packages in `npx skills` discovery. See `skills/README.md` for
the full publishing runbook (skills.sh has no submission step; ClawHub needs
`clawhub skill publish`).

For `skills/chatbotx/SKILL.md`'s "MCP Tools" table: the tool-count claim
("curated default set of N tools") and the per-category tool list must match
whatever the codebase actually marks `visibility: "default"` — grep for
`mcpSpec({ visibility: "default"` under `apps/builder/src` if unsure which
operations currently opt in. `apps/builder/__tests__/public-spec-mcp.test.ts`
pins this file against the live default tool set and fails CI on drift.

## 4. Verify against a live instance, not just the docs

```bash
pnpm --filter chatbotx dev:cli -- --refresh-spec <new-group> --help
pnpm --filter chatbotx-mcp-server dev:mcp   # then call tools/list against it
```

Confirm the command/tool you documented actually appears with the flags you
wrote down — the generated surface is the ground truth; the docs describe it,
never the reverse.

## Stop condition

New/changed public operation shipped → spec test green, collision check run,
every applicable file in the step-3 table updated and cross-checked against
each other, command/tool verified live. Skipping the collision check or
leaving one of the four files stale is the failure mode this skill exists to
prevent.
