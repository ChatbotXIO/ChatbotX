import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

const sql = readFileSync(
  join(
    import.meta.dirname,
    "../drizzle/20261030151215_better_auth_1_7/migration.sql",
  ),
  "utf8",
)

const statements = sql
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())

const indexOfStatement = (needle: string): number =>
  statements.findIndex((statement) => statement.includes(needle))

describe("better-auth 1.7 migration", () => {
  test("casts Verification.id to text before anything depends on it", () => {
    expect(statements[0]).toBe(
      'ALTER TABLE "Verification" ALTER COLUMN "id" TYPE text USING "id"::text;',
    )
  })

  test("deletes declined consents before dropping consentGiven", () => {
    const deleted = indexOfStatement(
      'DELETE FROM "OAuthConsent" WHERE "consentGiven" = false',
    )
    const dropped = indexOfStatement(
      'ALTER TABLE "OAuthConsent" DROP COLUMN "consentGiven"',
    )

    expect(deleted).toBeGreaterThanOrEqual(0)
    expect(dropped).toBeGreaterThan(deleted)
  })

  test("converts OAuthConsent.scopes from a space-separated string to text[]", () => {
    const conversion = statements.find((statement) =>
      statement.startsWith('ALTER TABLE "OAuthConsent" ALTER COLUMN "scopes"'),
    )

    expect(conversion).toContain("TYPE text[]")
    expect(conversion).toContain(
      "regexp_split_to_array(btrim(\"scopes\"), '\\s+')",
    )
    expect(conversion).toContain("ARRAY[]::text[]")
  })

  test("allows a consent without a user", () => {
    expect(
      indexOfStatement('"OAuthConsent" ALTER COLUMN "userId" DROP NOT NULL'),
    ).toBeGreaterThanOrEqual(0)
  })
})
