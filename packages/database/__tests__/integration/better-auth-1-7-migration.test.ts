// @vitest-environment node

/**
 * Replays the Better Auth 1.6 → 1.7 migration against rows shaped exactly like
 * the ones 1.6's MCP plugin wrote, inside a throwaway schema that is rolled
 * back. The failure modes this pins are invisible to `db:check-drift`, which
 * only compares DDL:
 *
 * - 1.6 stored `redirectUrls` as `redirect_uris.join(",")`, not JSON.
 * - 1.6 stored a public client's secret as `''`, not NULL; 1.7 rejects a
 *   non-"none" auth method for a client without a secret.
 * - 1.7 hashes confidential secrets (SHA-256, base64url) by default, so a
 *   plaintext secret carried over verbatim could never authenticate.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()
const DRIZZLE_DIR = join(import.meta.dirname, "../../drizzle")
const STATEMENT_BREAKPOINT = "--> statement-breakpoint"
const SCRATCH_SCHEMA = "ba17_migration_probe"

const readStatements = (migration: string): string[] =>
  readFileSync(join(DRIZZLE_DIR, migration, "migration.sql"), "utf8")
    .split(STATEMENT_BREAKPOINT)
    .map((statement) => statement.trim())
    .filter(Boolean)

const sha256Base64Url = (value: string): string =>
  createHash("sha256").update(value).digest("base64url")

describe.skipIf(!databaseUrl)("better auth 1.7 migration", () => {
  let client: Client

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl as string })
    await client.connect()
    await client.query("BEGIN")
    await client.query(`CREATE SCHEMA ${SCRATCH_SCHEMA}`)
    await client.query(`SET LOCAL search_path TO ${SCRATCH_SCHEMA}`)

    // Only the tables the two migrations reference; everything else is irrelevant.
    await client.query('CREATE TABLE "User" ("id" bigint PRIMARY KEY)')
    await client.query('CREATE TABLE "Session" ("id" bigint PRIMARY KEY)')
    await client.query(
      'CREATE TABLE "Verification" ("id" bigint PRIMARY KEY, "identifier" text NOT NULL)',
    )
    await client.query('CREATE TABLE "Jwk" ("id" bigint PRIMARY KEY)')

    for (const statement of readStatements(
      "20261029080244_add_oauth_provider_tables",
    )) {
      await client.query(statement)
    }

    await client.query(
      `INSERT INTO "OAuthApplication"
         ("id", "name", "clientId", "clientSecret", "redirectUrls", "type", "metadata")
       VALUES
         (1, 'Public MCP client', 'public-client', '',
          'https://a.example/cb,https://b.example/cb', 'public', '{"k":"v"}'),
         (2, 'Confidential client', 'secret-client', 'plain-secret-value',
          'https://c.example/cb', 'web', NULL)`,
    )

    for (const statement of readStatements("20261030151215_better_auth_1_7")) {
      await client.query(statement)
    }
  })

  afterAll(async () => {
    await client?.query("ROLLBACK")
    await client?.end()
  })

  const findClient = async (clientId: string) => {
    const { rows } = await client.query(
      'SELECT * FROM "OAuthClient" WHERE "clientId" = $1',
      [clientId],
    )
    return rows[0]
  }

  test("splits comma-joined redirect URLs into separate URIs", async () => {
    const row = await findClient("public-client")

    expect(row.redirectUris).toEqual([
      "https://a.example/cb",
      "https://b.example/cb",
    ])
  })

  test("migrates an empty-secret client to a public client with no secret", async () => {
    const row = await findClient("public-client")

    expect(row.clientSecret).toBeNull()
    expect(row.tokenEndpointAuthMethod).toBe("none")
    expect(row.requirePKCE).toBe(true)
  })

  test("hashes a confidential client's plaintext secret the way Better Auth verifies it", async () => {
    const row = await findClient("secret-client")

    expect(row.tokenEndpointAuthMethod).toBe("client_secret_basic")
    expect(row.clientSecret).toBe(sha256Base64Url("plain-secret-value"))
  })

  test("keeps legacy metadata as jsonb and leaves no helper functions behind", async () => {
    const row = await findClient("public-client")
    const { rows: helpers } = await client.query(
      `SELECT proname FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = $1 AND proname LIKE '\\_\\_oauth%'`,
      [SCRATCH_SCHEMA],
    )

    expect(row.metadata).toEqual({ k: "v" })
    expect(helpers).toEqual([])
  })
})
