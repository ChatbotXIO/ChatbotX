/**
 * Phase 5 backfill for docs/plans/2026-08-28-custom-field-value-normalization.md.
 *
 * Legacy `ContactCustomField.value` / `BotField.value` rows written before the
 * write-side normalizer (packages/business/src/contact-custom-field/normalize.ts)
 * landed can hold non-canonical `boolean`/`number` text — e.g. `boolean =
 * "TRUE"`/`"1"`/`" true "`, `number = "007"`/`" 1.50 "`. The contact-filter SQL
 * guard (packages/database/src/queries/contact-filter/custom-field-predicates.ts)
 * is whitespace/case-tolerant for `boolean`, so those rows already filter
 * correctly without this script — this is cosmetic/consistency cleanup, not a
 * correctness fix.
 *
 * DRY-RUN BY DEFAULT. Reads only, prints a per-field report of how many stored
 * values are already canonical, how many would be rewritten, and how many are
 * left alone because they don't parse as the field's type. Pass `--fix` to
 * actually apply the rewrites.
 *
 * The script applies the SAME semantics as every write path (user-confirmed):
 * - `boolean` uses the generous `coerceBooleanLiteral` — a falsy literal
 *   (`f/false/n/no/off/0`, any case/whitespace) → `"false"`, ANY other
 *   non-blank value → `"true"`. Blank values are left untouched (unset).
 *   The dry-run report lists every rewrite before `--fix` applies anything.
 * - `number` uses the same `normalizeNumber` the write path uses (imported
 *   read-only from `packages/business/src/javascript-execution/custom-field-value.ts`
 *   — this script does NOT edit anything under packages/business/src/**).
 *   Blank stays blank (means "unset"); a value that fails the numeric regex
 *   is left untouched and reported.
 *
 * Query strategy (see the plan doc): `ContactCustomField` has no `workspaceId`
 * and is indexed on `(contactId, customFieldId)` and `(customFieldId, id)`, so
 * this enumerates boolean/number `CustomField` definitions first, then
 * keyset-paginates `ContactCustomField` per field on `(customFieldId, id)` —
 * never an offset scan, never a full-table update. `BotField` is small, so it
 * is scanned directly (still keyset-paginated on `id` for memory safety).
 *
 * `--fix` applies rewrites as parameterized per-row `UPDATE ... WHERE id = $1`
 * statements, batched inside one transaction per fetched page (drizzle's
 * query builder — no raw string interpolation of any stored value).
 *
 * Cache: contact-custom-field reads are cached via `withCache` under tags
 * `contacts`, `contacts:<workspaceId>`, `contacts:<contactId>` (see
 * `contactCacheTags` in packages/business/src/contact-custom-field/service.ts
 * and packages/business/src/contact/service.ts) with an up-to-24h TTL. This
 * script does NOT purge any cache — it only rewrites rows in Postgres. Any
 * contact whose custom-field value this script rewrote may keep serving the
 * OLD value from cache until its tag-scoped entries expire by TTL. To force
 * an immediate refresh for affected contacts, call
 * `invalidateCacheByTags([`contacts:${contactId}`, ...])` from `@chatbotx.io/redis`
 * for each affected contactId (or `contacts:<workspaceId>` to cover a whole
 * workspace) — never a global cache flush, which would drop unrelated keys.
 *
 * Usage:
 *   pnpm tsx scripts/normalize-field-values.mts [--fix] [envFile]
 *
 * Defaults to `.env.prod` (dry-run). Only `DATABASE_URL` is required.
 */

const cliArgs = process.argv.slice(2)
const fix = cliArgs.includes("--fix")
const envFile = cliArgs.find((arg) => !arg.startsWith("--")) ?? ".env.prod"

process.loadEnvFile(envFile)
process.env.SKIP_ENV_CHECK = "true"

// Imported by relative path (not the `@chatbotx.io/database/client` bare
// specifier) — this script lives at the repo root, outside any workspace
// package's own dependency graph. Node resolves a relative import's OWN bare
// specifiers against ITS location, so this reaches packages/database's (and
// packages/business's) node_modules instead of the repo root's, which does
// not depend on either. Mirrors scripts/audit-bot-field-reserved-names.mts.
const { db, eq } = await import("../packages/database/src/client.ts")
const { botFieldModel, contactCustomFieldModel } = await import(
  "../packages/database/src/schema/index.ts"
)
const { coerceBooleanLiteral } = await import(
  "../packages/utils/src/custom-field.ts"
)
// Read-only reuse of the single-source-of-truth number normalizer the write
// path (packages/business/src/contact-custom-field/normalize.ts) already
// delegates to — never a second, hand-rolled copy that could drift.
const { normalizeNumber } = await import(
  "../packages/business/src/javascript-execution/custom-field-value.ts"
)
const { invalidateCacheByTags } = await import(
  "../packages/redis/src/cache-utils.ts"
)

const BATCH_SIZE = 1000
const MAX_SAMPLES_PER_REPORT = 5

type NormalizableType = "boolean" | "number"

type ClassifyOutcome = "canonical" | "fixable" | "unparseable" | "skip"

type ClassifyResult = {
  outcome: ClassifyOutcome
  canonical?: string
}

/**
 * `skip` = blank/unset — never touched, not even counted as unparseable.
 * `unparseable` = non-blank but doesn't recognize as this type's literal —
 * left untouched and reported so a human can look at it.
 */
function classifyValue(type: NormalizableType, value: string): ClassifyResult {
  if (type === "boolean") {
    if (value.length === 0) {
      return { outcome: "skip" }
    }
    const canonical = coerceBooleanLiteral(value)
    return canonical === value
      ? { outcome: "canonical" }
      : { outcome: "fixable", canonical }
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return { outcome: "skip" }
  }
  const canonical = normalizeNumber(trimmed)
  if (canonical === null) {
    return { outcome: "unparseable" }
  }
  return canonical === value
    ? { outcome: "canonical" }
    : { outcome: "fixable", canonical }
}

type FieldReport = {
  label: string
  scanned: number
  canonical: number
  fixable: number
  unparseable: number
  skipped: number
  fixableSamples: Array<{ id: string; from: string; to: string }>
  unparseableSamples: Array<{ id: string; value: string }>
}

function newReport(label: string): FieldReport {
  return {
    label,
    scanned: 0,
    canonical: 0,
    fixable: 0,
    unparseable: 0,
    skipped: 0,
    fixableSamples: [],
    unparseableSamples: [],
  }
}

function recordOutcome(
  report: FieldReport,
  id: string,
  value: string,
  result: ClassifyResult,
): void {
  report.scanned += 1
  if (result.outcome === "skip") {
    report.skipped += 1
    return
  }
  if (result.outcome === "canonical") {
    report.canonical += 1
    return
  }
  if (result.outcome === "unparseable") {
    report.unparseable += 1
    if (report.unparseableSamples.length < MAX_SAMPLES_PER_REPORT) {
      report.unparseableSamples.push({ id, value })
    }
    return
  }
  // fixable
  report.fixable += 1
  if (report.fixableSamples.length < MAX_SAMPLES_PER_REPORT) {
    report.fixableSamples.push({ id, from: value, to: result.canonical ?? "" })
  }
}

function printReport(report: FieldReport): void {
  console.log(
    `\n${report.label}\n` +
      `  scanned=${report.scanned} canonical=${report.canonical} ` +
      `fixable=${report.fixable} unparseable=${report.unparseable} skipped(blank)=${report.skipped}`,
  )
  for (const sample of report.fixableSamples) {
    console.log(
      `    [fixable] id=${sample.id} ${JSON.stringify(sample.from)} -> ${JSON.stringify(sample.to)}`,
    )
  }
  for (const sample of report.unparseableSamples) {
    console.log(
      `    [unparseable] id=${sample.id} value=${JSON.stringify(sample.value)}`,
    )
  }
}

/**
 * Applies rewrites for one fetched page inside a single transaction — each
 * row gets its own parameterized `UPDATE ... WHERE id = $1` (drizzle's query
 * builder; no raw string interpolation of any stored value).
 */
async function applyFixes(
  table: typeof contactCustomFieldModel | typeof botFieldModel,
  updates: Array<{ id: string; value: string }>,
): Promise<void> {
  if (updates.length === 0) {
    return
  }
  await db.transaction(async (tx) => {
    for (const update of updates) {
      await tx
        .update(table)
        .set({ value: update.value })
        .where(eq(table.id, update.id))
    }
  })
}

async function processContactCustomField(field: {
  id: string
  workspaceId: string
  name: string
  type: NormalizableType
}): Promise<FieldReport> {
  const report = newReport(
    `CustomField id=${field.id} workspaceId=${field.workspaceId} name=${JSON.stringify(field.name)} type=${field.type}`,
  )

  let cursor: string | undefined
  for (;;) {
    const rows = await db.query.contactCustomFieldModel.findMany({
      where: {
        customFieldId: field.id,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      columns: { id: true, value: true },
      orderBy: { id: "asc" },
      limit: BATCH_SIZE,
    })
    if (rows.length === 0) {
      break
    }

    const updates: Array<{ id: string; value: string }> = []
    for (const row of rows) {
      const result = classifyValue(field.type, row.value)
      recordOutcome(report, row.id, row.value, result)
      if (result.outcome === "fixable" && result.canonical !== undefined) {
        updates.push({ id: row.id, value: result.canonical })
      }
    }

    if (fix) {
      await applyFixes(contactCustomFieldModel, updates)
    }

    cursor = rows.at(-1)?.id
    if (rows.length < BATCH_SIZE) {
      break
    }
  }

  return report
}

async function processBotFields(type: NormalizableType): Promise<FieldReport> {
  const report = newReport(`BotField type=${type}`)

  let cursor: string | undefined
  for (;;) {
    const rows = await db.query.botFieldModel.findMany({
      where: {
        type,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      columns: { id: true, workspaceId: true, value: true },
      orderBy: { id: "asc" },
      limit: BATCH_SIZE,
    })
    if (rows.length === 0) {
      break
    }

    const updates: Array<{ id: string; value: string }> = []
    for (const row of rows) {
      if (row.value === null) {
        report.scanned += 1
        report.skipped += 1
        continue
      }
      const result = classifyValue(type, row.value)
      recordOutcome(
        report,
        `${row.id} (ws=${row.workspaceId})`,
        row.value,
        result,
      )
      if (result.outcome === "fixable" && result.canonical !== undefined) {
        updates.push({ id: row.id, value: result.canonical })
      }
    }

    if (fix) {
      await applyFixes(botFieldModel, updates)
    }

    cursor = rows.at(-1)?.id
    if (rows.length < BATCH_SIZE) {
      break
    }
  }

  return report
}

async function enumerateNormalizableCustomFields(): Promise<
  Array<{
    id: string
    workspaceId: string
    name: string
    type: NormalizableType
  }>
> {
  const fields: Array<{
    id: string
    workspaceId: string
    name: string
    type: NormalizableType
  }> = []

  let cursor: string | undefined
  for (;;) {
    const rows = await db.query.customFieldModel.findMany({
      where: {
        type: { in: ["boolean", "number"] },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      columns: { id: true, workspaceId: true, name: true, type: true },
      orderBy: { id: "asc" },
      limit: BATCH_SIZE,
    })
    if (rows.length === 0) {
      break
    }
    for (const row of rows) {
      fields.push({
        id: row.id,
        workspaceId: row.workspaceId,
        name: row.name,
        type: row.type as NormalizableType,
      })
    }
    cursor = rows.at(-1)?.id
    if (rows.length < BATCH_SIZE) {
      break
    }
  }

  return fields
}

function addTotals(total: FieldReport, report: FieldReport): void {
  total.scanned += report.scanned
  total.canonical += report.canonical
  total.fixable += report.fixable
  total.unparseable += report.unparseable
  total.skipped += report.skipped
}

console.log(
  `Normalizing boolean/number field values from env file "${envFile}" (${
    fix ? "FIX MODE — writes will be applied" : "DRY RUN — no writes"
  })...`,
)

const customFields = await enumerateNormalizableCustomFields()
console.log(
  `Found ${customFields.length} boolean/number CustomField definition(s) to scan.`,
)

const contactFieldTotal = newReport("TOTAL — ContactCustomField")
for (const field of customFields) {
  const report = await processContactCustomField(field)
  printReport(report)
  addTotals(contactFieldTotal, report)
}
printReport(contactFieldTotal)

const botFieldBooleanReport = await processBotFields("boolean")
const botFieldNumberReport = await processBotFields("number")
printReport(botFieldBooleanReport)
printReport(botFieldNumberReport)

const grandTotal = newReport("GRAND TOTAL")
addTotals(grandTotal, contactFieldTotal)
addTotals(grandTotal, botFieldBooleanReport)
addTotals(grandTotal, botFieldNumberReport)
printReport(grandTotal)

// Bot-field caches (per-key reads + the variables package's per-workspace
// variable-map) all subscribe to the single global "bot-fields" tag —
// invalidating it is cheap and precise (unlike the per-contact tags below,
// which are only mentioned in the reminder). Without this, a rewritten bot
// field value could keep serving stale for up to its cache TTL.
const botFieldFixesApplied =
  fix && botFieldBooleanReport.fixable + botFieldNumberReport.fixable > 0
if (botFieldFixesApplied) {
  await invalidateCacheByTags(["bot-fields"])
  console.log("\nInvalidated bot-field caches (tag: bot-fields).")
}

if (fix && grandTotal.fixable > 0) {
  console.log(
    "\n--fix applied. Reminder: contact-custom-field reads are cached under " +
      "the `contacts` / `contacts:<workspaceId>` / `contacts:<contactId>` tags " +
      "(see contactCacheTags in packages/business/src/contact-custom-field/service.ts) " +
      "with up to a 24h TTL. This script did not purge the cache — affected " +
      "contacts may keep serving the old value until their tagged entries " +
      "expire, unless you call invalidateCacheByTags with a contacts:<contactId> " +
      "tag from @chatbotx.io/redis for each contact this run touched.",
  )
} else if (!fix && grandTotal.fixable > 0) {
  console.log(
    `\nDry run found ${grandTotal.fixable} rewritable value(s). Re-run with --fix to apply.`,
  )
} else if (grandTotal.unparseable > 0) {
  console.log(
    `\nNo rewritable values found, but ${grandTotal.unparseable} value(s) do not ` +
      "parse as their field's type — see the [unparseable] samples above. " +
      "This script never guesses at those; fix them manually if needed.",
  )
} else {
  console.log("\nNo non-canonical values found.")
}

// Postgres connection keeps the event loop alive — force exit.
setTimeout(() => process.exit(0), 500)
