/**
 * READ-ONLY rollout audit for the Account Fields reserved `bot_field:` prefix
 * guard — run this BEFORE enabling Account Fields in production.
 *
 * `setValueByKey`/`deleteByKey` (packages/business/src/contact-custom-field/
 * service.ts) and the flow "set/clear custom field" pickers now treat any
 * value of the shape `bot_field:<id>` as a reference token, not a literal
 * field id/name. `createCustomFieldRequest`/`createBotFieldRequest` already
 * reject new names starting with that prefix (see `zodFieldName()` in
 * packages/flow-config/src/field-reference.ts), but that guard did not exist
 * before this feature — so a workspace could already contain a row created
 * before the guard whose name (or a stored field-reference value) collides
 * with the reserved shape.
 *
 * This script checks, across every workspace:
 *   (a) `CustomField.name` / `BotField.name` rows that already start with the
 *       reserved "bot_field:" prefix.
 *   (b) `FlowVersion.nodes` / `FlowVersion.edges` / `Trigger.actions` jsonb
 *       containing a string value matching `/^bot_field:(?!\d+$)/` — i.e. a
 *       MALFORMED near-token (`bot_field:`, `bot_field:abc`, ...), which is
 *       exactly what `parseFieldReference`/`zodFieldReference` reject at
 *       write time. A well-formed `bot_field:123` token is NOT flagged.
 *
 * (b) walks every string leaf in those jsonb blobs (not just known
 * field-reference keys), so it can never miss a new step type — the
 * tradeoff is an occasional false positive from unrelated free text (e.g. a
 * message body) that happens to start with "bot_field:". Treat every hit as
 * something to manually confirm, not an automatic rename target.
 *
 * NEVER writes anything. Prints every finding and exits 1 if any were found,
 * 0 if the database is clean. If a row is found, rename it via the normal
 * update API (which now rejects the reserved prefix) before rollout.
 *
 * Usage:
 *   pnpm tsx scripts/audit-bot-field-reserved-names.mts [envFile]
 *
 * Defaults to `.env.prod`. Only `DATABASE_URL` is required — no Redis/queue
 * access, no writes. Pass a different env file (e.g. `.env`) to audit
 * another database.
 */

const [envFile = ".env.prod"] = process.argv.slice(2)
process.loadEnvFile(envFile)
process.env.SKIP_ENV_CHECK = "true"

// Import AFTER env is loaded — package env schemas read process.env at import
// time. Imported by relative path (not the `@chatbotx.io/database/client`
// bare specifier) because this script lives at the repo root, outside any
// workspace package's own dependency graph — Node resolves a relative
// import's bare specifiers against ITS OWN location, so this reaches
// `packages/database`'s node_modules instead of the repo root's (which does
// not depend on `@chatbotx.io/database` at all). Mirrors the same trick
// `scripts/debug-run-job.mts` uses for its handler import.
// `db.query.*` resolves against the schema already wired into the client, so
// the table modules themselves don't need importing here.
const { db } = await import("../packages/database/src/client.ts")

const RESERVED_PREFIX_LIKE = "bot_field:%"
// Well-formed token is `bot_field:<digits>` — anything else starting with the
// prefix is malformed and would silently misroute once the picker widening ships.
const MALFORMED_TOKEN_PATTERN = /^bot_field:(?!\d+$)/
// Symmetric with flow-config's own walker depth ceiling (see
// packages/flow-config/src/import-export/reference-fields.ts) — guards
// against pathologically deep jsonb blobs blowing the stack.
const MAX_WALK_DEPTH = 1000
const BATCH_SIZE = 500

type JsonFinding = { path: string; value: string }

const walkForMalformedTokens = (
  value: unknown,
  path: string,
  depth: number,
  out: JsonFinding[],
): void => {
  if (depth > MAX_WALK_DEPTH) {
    return
  }
  if (typeof value === "string") {
    if (MALFORMED_TOKEN_PATTERN.test(value)) {
      out.push({ path, value })
    }
    return
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      walkForMalformedTokens(item, `${path}[${index}]`, depth + 1, out)
    }
    return
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      walkForMalformedTokens(child, `${path}.${key}`, depth + 1, out)
    }
  }
}

async function auditReservedNames(): Promise<boolean> {
  const [customFields, botFields] = await Promise.all([
    db.query.customFieldModel.findMany({
      where: { name: { like: RESERVED_PREFIX_LIKE } },
      columns: { id: true, workspaceId: true, name: true },
    }),
    db.query.botFieldModel.findMany({
      where: { name: { like: RESERVED_PREFIX_LIKE } },
      columns: { id: true, workspaceId: true, name: true },
    }),
  ])

  for (const row of customFields) {
    console.error(
      `[reserved-name] CustomField id=${row.id} workspaceId=${row.workspaceId} name=${JSON.stringify(row.name)}`,
    )
  }
  for (const row of botFields) {
    console.error(
      `[reserved-name] BotField id=${row.id} workspaceId=${row.workspaceId} name=${JSON.stringify(row.name)}`,
    )
  }

  return customFields.length > 0 || botFields.length > 0
}

async function auditFlowVersions(): Promise<boolean> {
  let found = false
  let offset = 0

  for (;;) {
    const rows = await db.query.flowVersionModel.findMany({
      columns: {
        id: true,
        workspaceId: true,
        flowId: true,
        nodes: true,
        edges: true,
      },
      orderBy: { id: "asc" },
      limit: BATCH_SIZE,
      offset,
    })
    if (rows.length === 0) {
      break
    }

    for (const row of rows) {
      const findings: JsonFinding[] = []
      walkForMalformedTokens(row.nodes, "nodes", 0, findings)
      walkForMalformedTokens(row.edges, "edges", 0, findings)

      if (findings.length > 0) {
        found = true
        for (const finding of findings) {
          console.error(
            `[malformed-token] FlowVersion id=${row.id} workspaceId=${row.workspaceId} flowId=${row.flowId} path=${finding.path} value=${JSON.stringify(finding.value)}`,
          )
        }
      }
    }

    offset += rows.length
    if (rows.length < BATCH_SIZE) {
      break
    }
  }

  return found
}

async function auditTriggers(): Promise<boolean> {
  let found = false
  let offset = 0

  for (;;) {
    const rows = await db.query.triggerModel.findMany({
      columns: { id: true, workspaceId: true, actions: true },
      orderBy: { id: "asc" },
      limit: BATCH_SIZE,
      offset,
    })
    if (rows.length === 0) {
      break
    }

    for (const row of rows) {
      const findings: JsonFinding[] = []
      walkForMalformedTokens(row.actions, "actions", 0, findings)

      if (findings.length > 0) {
        found = true
        for (const finding of findings) {
          console.error(
            `[malformed-token] Trigger id=${row.id} workspaceId=${row.workspaceId} path=${finding.path} value=${JSON.stringify(finding.value)}`,
          )
        }
      }
    }

    offset += rows.length
    if (rows.length < BATCH_SIZE) {
      break
    }
  }

  return found
}

console.log(`Auditing database from env file "${envFile}" (read-only)...`)

const [namesFound, flowVersionsFound, triggersFound] = await Promise.all([
  auditReservedNames(),
  auditFlowVersions(),
  auditTriggers(),
])

const anyFound = namesFound || flowVersionsFound || triggersFound

if (anyFound) {
  console.error(
    "\nFound rows colliding with the reserved bot_field: prefix — rename them via the normal update API before enabling Account Fields.",
  )
  process.exitCode = 1
} else {
  console.log("Clean: no reserved-prefix collisions found.")
  process.exitCode = 0
}

// Postgres connection keeps the event loop alive — force exit.
setTimeout(() => process.exit(process.exitCode ?? 0), 500)
