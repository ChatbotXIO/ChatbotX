// @vitest-environment node

/**
 * Catalog checks for the workspace-hash partitioned contact activity tables.
 *
 * These run only against an explicitly configured local database, after the
 * approved migration has been applied. They create no rows.
 */

import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

type TableExpectation = {
  indexes: Record<string, string | undefined>
  primaryKey: string[]
  table: string
}

const TABLES: TableExpectation[] = [
  {
    indexes: { ContactActivity_reference_idx: undefined },
    primaryKey: [
      "workspaceId",
      "contactId",
      "activityType",
      "referenceType",
      "parentReferenceId",
      "referenceId",
    ],
    table: "ContactActivity",
  },
  {
    indexes: {
      ContactKeywordMessage_text_prefix_idx: "text_pattern_ops",
      ContactKeywordMessage_text_trgm_idx: "gin_trgm_ops",
    },
    primaryKey: ["workspaceId", "contactId", "messageId"],
    table: "ContactKeywordMessage",
  },
  {
    indexes: { ContactState_lastDeliveredAt_idx: undefined },
    primaryKey: ["workspaceId", "contactId"],
    table: "ContactState",
  },
]

describe.skipIf(!databaseUrl)("contact activity partition catalog", () => {
  let client: Client

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl ?? undefined })
    await client.connect()
  })

  afterAll(async () => {
    await client.end()
  })

  test.each(
    TABLES,
  )("$table is hash partitioned by workspaceId", async (expected) => {
    const { rows } = await client.query<{
      child_count: string
      partition_columns: string[]
      partition_strategy: string
      primary_key_columns: string[]
    }>(
      `
      SELECT
        (SELECT COUNT(*)::text FROM pg_inherits WHERE inhparent = $1::regclass) AS child_count,
        (SELECT array_agg(attribute.attname::text ORDER BY key.ordinality)
           FROM pg_partitioned_table partitioned
           CROSS JOIN LATERAL unnest(partitioned.partattrs::int2[]) WITH ORDINALITY AS key(attnum, ordinality)
           JOIN pg_attribute attribute
             ON attribute.attrelid = partitioned.partrelid AND attribute.attnum = key.attnum
          WHERE partitioned.partrelid = $1::regclass) AS partition_columns,
        (SELECT partitioned.partstrat::text FROM pg_partitioned_table partitioned
          WHERE partitioned.partrelid = $1::regclass) AS partition_strategy,
        (SELECT array_agg(attribute.attname::text ORDER BY key.ordinality)
           FROM pg_constraint table_constraint
           CROSS JOIN LATERAL unnest(table_constraint.conkey) WITH ORDINALITY AS key(attnum, ordinality)
           JOIN pg_attribute attribute
             ON attribute.attrelid = table_constraint.conrelid AND attribute.attnum = key.attnum
          WHERE table_constraint.conrelid = $1::regclass AND table_constraint.contype = 'p') AS primary_key_columns
      `,
      [`"${expected.table}"`],
    )

    expect(rows[0]).toMatchObject({
      child_count: "64",
      partition_columns: ["workspaceId"],
      partition_strategy: "h",
      primary_key_columns: expected.primaryKey,
    })
  })

  test.each(
    TABLES,
  )("$table has its named indexes on all 64 leaves", async (expected) => {
    for (const [indexName, opclass] of Object.entries(expected.indexes)) {
      const { rows } = await client.query<{ definition: string }>(
        `SELECT pg_get_indexdef(index_definition.indexrelid) AS definition
           FROM pg_inherits inheritance
           JOIN pg_index index_definition ON index_definition.indexrelid = inheritance.inhrelid
          WHERE inheritance.inhparent = $1::regclass`,
        [`"${indexName}"`],
      )
      expect(rows).toHaveLength(64)
      if (opclass) {
        expect(rows.every((row) => row.definition.includes(opclass))).toBe(true)
      }
    }
  })

  test("ContactState leaves carry fillfactor 80", async () => {
    const { rows } = await client.query<{ reloptions: string[] | null }>(
      `SELECT leaf.reloptions
         FROM pg_inherits inheritance
         JOIN pg_class leaf ON leaf.oid = inheritance.inhrelid
        WHERE inheritance.inhparent = '"ContactState"'::regclass`,
    )
    expect(rows).toHaveLength(64)
    expect(rows.every((row) => row.reloptions?.includes("fillfactor=80"))).toBe(
      true,
    )
  })

  test("has the allowed-pair CHECK constraint on the parent", async () => {
    const { rows } = await client.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
        WHERE conrelid = '"ContactActivity"'::regclass
          AND conname = 'ContactActivity_allowed_pair_check'`,
    )
    expect(rows).toHaveLength(1)
  })

  test("AnalyticsEmailTopic keeps tracking rows when a topic is deleted", async () => {
    const { rows } = await client.query<{
      confdeltype: string
      notnull: boolean
    }>(
      `SELECT (SELECT confdeltype::text FROM pg_constraint
                WHERE conname = 'AnalyticsEmailTopic_topicId_EmailTopic_id_fkey') AS confdeltype,
              (SELECT attnotnull FROM pg_attribute
                WHERE attrelid = '"AnalyticsEmailTopic"'::regclass AND attname = 'topicId') AS notnull`,
    )
    expect(rows[0]).toEqual({ confdeltype: "n", notnull: false })
  })
})
