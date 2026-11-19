import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

const migrationSql = readFileSync(
  join(
    import.meta.dirname,
    "../drizzle/20261118082940_contact_info_capture/migration.sql",
  ),
  "utf8",
)

const ALTER_TABLE_RE = /ALTER TABLE/i

describe("contact_info_capture migration", () => {
  test("creates the table hash-partitioned by workspaceId", () => {
    expect(migrationSql).toContain('PARTITION BY HASH ("workspaceId")')
  })

  test("creates 32 hash partitions", () => {
    expect(migrationSql).toContain("FOR i IN 0..31 LOOP")
    expect(migrationSql).toContain("FOR VALUES WITH (MODULUS 32, REMAINDER %s)")
    expect(migrationSql).toContain("partition_count <> 32")
  })

  test("primary key leads with the partition column", () => {
    expect(migrationSql).toContain(
      'PRIMARY KEY("workspaceId","sourceType","sourceId","infoType","contactId")',
    )
  })

  test("only creates new objects: no ALTER TABLE on live tables", () => {
    expect(migrationSql).not.toMatch(ALTER_TABLE_RE)
  })
})
