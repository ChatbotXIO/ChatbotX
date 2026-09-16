/**
 * Reconciles the `drizzle.__drizzle_migrations` ledger against the actual
 * schema, without applying real DDL against an already-migrated database and
 * without losing any data.
 *
 * Problem this solves: a database's ledger can diverge from its physical
 * schema — some migrations Drizzle considers "pending" may already be
 * applied out-of-band (e.g. a table was created by an older script, a manual
 * `psql` session, or a migration that ran but crashed before recording
 * itself), while others really are pending. Blindly running `db:migrate`
 * against such a database fails the moment it hits a `CREATE TABLE`/`ADD
 * COLUMN` whose target already exists.
 *
 * For every migration `getMigrationsToRun` considers pending, in folder
 * order, this script runs its statements one at a time inside a SAVEPOINT.
 * A statement that fails with a Postgres "already exists" (or, for a DROP,
 * "does not exist") class error means its target is already applied —
 * that statement's attempt is rolled back and the WHOLE migration is
 * classified RECORD-ONLY: every change it made is rolled back to the
 * migration's own savepoint and it is inserted into the ledger without ever
 * having taken effect. A migration whose statements all succeed cleanly is
 * classified RUN: its changes are kept and it is recorded normally. Any
 * other error aborts the whole run (nothing committed) so a human can look
 * at it — the true unknown fully idempotent migrations (see
 * `20260914150000_whatsapp_calling_consolidated`) always fall into RUN,
 * since their own IF-NOT-EXISTS guards mean they never throw a duplicate
 * error even when some of what they create already exists.
 *
 * The ENTIRE run — every pending migration — happens inside one Postgres
 * transaction, advisory-locked exactly like `run-migrations.mjs`:
 *   - `--dry-run` (default): the transaction is rolled back at the end no
 *     matter what happened, so nothing is ever committed.
 *   - `--apply`: the transaction is committed once every pending migration
 *     has been classified (RUN or RECORD-ONLY) without a genuine error.
 *
 * Usage:
 *   DATABASE_URL=... node ./scripts/reconcile-ledger.mjs           # dry run
 *   DATABASE_URL=... node ./scripts/reconcile-ledger.mjs --dry-run  # same
 *   DATABASE_URL=... node ./scripts/reconcile-ledger.mjs --apply    # commits
 */
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { readMigrationFiles } from "drizzle-orm/migrator"
import { getMigrationsToRun } from "drizzle-orm/migrator.utils"
import { Pool } from "pg"

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = join(__dirname, "..", "drizzle")
const migrationLockName = "chatbotx:database:reconcile-ledger"
const migrationsSchema = "drizzle"
const migrationsTable = "__drizzle_migrations"

const args = process.argv.slice(2)
const APPLY = args.includes("--apply")
const DRY_RUN = !APPLY

/**
 * Postgres SQLSTATEs that mean "this object already exists" (creating it
 * again is a no-op we can safely treat as already-applied) or, for a bare
 * `DROP` without `IF EXISTS`, "this object does not exist" (also already
 * applied — something downstream already removed it).
 *
 * - 42P06 duplicate_schema
 * - 42P07 duplicate_table       (CREATE TABLE / CREATE INDEX name collision)
 * - 42710 duplicate_object      (CREATE TYPE, ADD CONSTRAINT name collision)
 * - 42701 duplicate_column      (ADD COLUMN that already exists)
 * - 42704 undefined_object      (DROP ... on something already gone)
 * - 42P16 invalid_table_definition (rare CREATE TABLE conflict variant)
 */
const DUPLICATE_SQLSTATES = new Set([
  "42P06",
  "42P07",
  "42710",
  "42701",
  "42704",
  "42P16",
])

/**
 * 23505 (unique_violation) is ambiguous: it usually means a real data
 * conflict, not "already applied". It only counts as an already-applied
 * signal when Postgres attaches a `constraint` name to the error — i.e. the
 * statement itself was trying to (re)establish a constraint/unique index
 * that is already enforcing the same rule, not a plain data collision from
 * inserting a row.
 */
const isDuplicateClassError = (error) => {
  if (!error || typeof error.code !== "string") {
    return false
  }
  if (DUPLICATE_SQLSTATES.has(error.code)) {
    return true
  }
  return error.code === "23505" && Boolean(error.constraint)
}

const formatError = (error) =>
  `${error.code ?? "unknown"}: ${error.message ?? String(error)}`

/**
 * Runs one migration's statements against `client`, each inside its own
 * SAVEPOINT, nested inside a SAVEPOINT for the whole migration.
 *
 * Returns `{ classification: "run" | "record-only", detail }`. Throws if a
 * statement fails with a non-duplicate-class error — the caller aborts the
 * whole run on that.
 */
const runMigrationStatements = async (client, migration, savepointId) => {
  const statements = migration.sql.filter((stmt) => stmt.trim())
  const migrationSavepoint = `reconcile_migration_${savepointId}`
  await client.query(`SAVEPOINT ${migrationSavepoint}`)

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i]
    const statementSavepoint = `reconcile_stmt_${savepointId}_${i}`
    await client.query(`SAVEPOINT ${statementSavepoint}`)

    try {
      await client.query(statement)
      await client.query(`RELEASE SAVEPOINT ${statementSavepoint}`)
    } catch (error) {
      await client.query(`ROLLBACK TO SAVEPOINT ${statementSavepoint}`)
      await client.query(`RELEASE SAVEPOINT ${statementSavepoint}`)

      if (!isDuplicateClassError(error)) {
        // Genuine, unexpected failure — undo everything this migration did
        // and let the caller abort the whole run.
        await client.query(`ROLLBACK TO SAVEPOINT ${migrationSavepoint}`)
        await client.query(`RELEASE SAVEPOINT ${migrationSavepoint}`)
        throw new Error(
          `${migration.name}: statement ${i + 1}/${statements.length} failed with a non-duplicate error: ${formatError(error)}\n${statement.trim().slice(0, 300)}`,
        )
      }

      // Already applied — discard everything this migration did (including
      // any earlier statements in it that succeeded before this one hit a
      // duplicate) and record it without ever taking effect.
      await client.query(`ROLLBACK TO SAVEPOINT ${migrationSavepoint}`)
      await client.query(`RELEASE SAVEPOINT ${migrationSavepoint}`)
      return {
        classification: "record-only",
        detail: `statement ${i + 1}/${statements.length} already applied (${formatError(error)})`,
      }
    }
  }

  await client.query(`RELEASE SAVEPOINT ${migrationSavepoint}`)
  return {
    classification: "run",
    detail: `${statements.length} statement(s) applied`,
  }
}

const printPlanTable = (rows) => {
  const headers = ["Migration", "Classification", "Detail"]
  const widths = headers.map((header, columnIndex) =>
    Math.max(
      header.length,
      ...rows.map((row) => String(row[columnIndex] ?? "").length),
    ),
  )
  const printRow = (cells) =>
    console.log(
      cells.map((cell, index) => String(cell).padEnd(widths[index])).join("  "),
    )

  printRow(headers)
  printRow(widths.map((width) => "-".repeat(width)))
  for (const row of rows) {
    printRow(row)
  }
}

const main = async () => {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error("DATABASE_URL is required to reconcile the migration ledger.")
    process.exit(1)
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 1 })
  let client
  let lockAcquired = false
  let exitCode = 0

  try {
    client = await pool.connect()
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [
      migrationLockName,
    ])
    lockAcquired = true

    await client.query("BEGIN")
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${migrationsSchema}"`)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${migrationsSchema}"."${migrationsTable}" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint,
        name text,
        applied_at timestamp with time zone DEFAULT now()
      )
    `)

    const localMigrations = readMigrationFiles({ migrationsFolder })
    const { rows: dbMigrations } = await client.query(
      `SELECT id, hash, created_at, name FROM "${migrationsSchema}"."${migrationsTable}"`,
    )
    const migrationsToRun = getMigrationsToRun({
      localMigrations,
      dbMigrations,
    })

    console.log(
      `${DRY_RUN ? "[DRY RUN]" : "[APPLY]"} ${migrationsToRun.length} pending migration(s) of ${localMigrations.length} local migration(s).\n`,
    )

    const planRows = []
    let hadRealFailure = false

    for (const [index, migration] of migrationsToRun.entries()) {
      let outcome
      try {
        outcome = await runMigrationStatements(client, migration, index)
      } catch (error) {
        console.error(`\n[ABORT] ${error.message}`)
        hadRealFailure = true
        break
      }

      const label = outcome.classification === "run" ? "RUN" : "RECORD-ONLY"
      planRows.push([migration.name, label, outcome.detail])

      await client.query(
        `insert into "${migrationsSchema}"."${migrationsTable}" ("hash", "created_at", "name") values ($1, $2, $3)`,
        [migration.hash, migration.folderMillis, migration.name ?? null],
      )
    }

    if (planRows.length > 0) {
      printPlanTable(planRows)
      console.log("")
    }

    if (hadRealFailure) {
      await client.query("ROLLBACK")
      console.error(
        "[ABORT] Rolled back — a genuine (non-duplicate-class) error means nothing was recorded or applied. Nothing was committed.",
      )
      exitCode = 1
    } else if (migrationsToRun.length === 0) {
      await client.query("ROLLBACK")
      console.log(
        "Nothing pending — ledger already matches the local migration set.",
      )
    } else if (DRY_RUN) {
      await client.query("ROLLBACK")
      console.log(
        "[DRY RUN] Rolled back — nothing was committed. Re-run with --apply to commit this plan.",
      )
    } else {
      await client.query("COMMIT")
      console.log(
        `[APPLY] Committed. ${planRows.filter((r) => r[1] === "RUN").length} migration(s) actually applied, ${planRows.filter((r) => r[1] === "RECORD-ONLY").length} recorded as already-applied.`,
      )
    }
  } catch (error) {
    try {
      await client?.query("ROLLBACK")
    } catch {
      // Connection may already be unusable — nothing more we can do.
    }
    console.error("Reconcile failed:", error)
    exitCode = 1
  } finally {
    if (client && lockAcquired) {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [
        migrationLockName,
      ])
    }
    client?.release()
    await pool.end()
  }

  process.exitCode = exitCode
}

await main()
