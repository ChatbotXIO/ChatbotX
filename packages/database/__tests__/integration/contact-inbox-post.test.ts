// @vitest-environment node

/**
 * Catalog checks for the workspace-hash partitioned comment-post table.
 *
 * These run only against an explicitly configured local database, after the
 * approved migrations have been applied. They deliberately create no rows, so
 * they are safe to run alongside the other integration catalog checks.
 */

import { and, eq, relationsFilterToSQL } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest"
import { applyContactFilter } from "../../src/queries/contact-filter"
import { relations } from "../../src/relations"
import { channelPostRepository } from "../../src/repositories/channel-post/repository"
import { contactInboxPostRepository } from "../../src/repositories/contact-inbox-post/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

const createDatabase = (client: Client) =>
  drizzle({ client, relations, schema })

type Fixture = {
  contactId: string
  contactInboxId: string
  externalPostId: string
  inboxId: string
  postId: string
  userId: string
  workspaceId: string
}

const collectExecutedPartitionRelations = (value: unknown): string[] => {
  if (!value || typeof value !== "object") {
    return []
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectExecutedPartitionRelations)
  }
  const record = value as Record<string, unknown>
  const relation = record["Relation Name"]
  const actualLoops = record["Actual Loops"]
  return [
    ...(typeof relation === "string" &&
    relation.startsWith("ContactInboxPost_p") &&
    typeof actualLoops === "number" &&
    actualLoops > 0
      ? [relation]
      : []),
    ...Object.values(record).flatMap(collectExecutedPartitionRelations),
  ]
}

const waitForLock = async (observer: Client, blockedPid: number) => {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const { rows } = await observer.query<{ wait_event_type: string | null }>(
      "SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1",
      [blockedPid],
    )
    if (rows[0]?.wait_event_type === "Lock") {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("expected purge transaction to wait for the writer lock")
}

describe.skipIf(!databaseUrl)("ContactInboxPost partition catalog", () => {
  let client: Client
  let fixture: Fixture
  let purgeClient: Client
  let writerClient: Client

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl as string })
    purgeClient = new Client({ connectionString: databaseUrl as string })
    writerClient = new Client({ connectionString: databaseUrl as string })
    await Promise.all([
      client.connect(),
      purgeClient.connect(),
      writerClient.connect(),
    ])
  })

  afterAll(async () => {
    await Promise.all([client?.end(), purgeClient?.end(), writerClient?.end()])
  })

  const deleteFixture = async () => {
    if (!fixture) {
      return
    }
    const db = createDatabase(client)
    await client.query(
      `DELETE FROM "ContactInboxPost" WHERE "workspaceId" = $1`,
      [fixture.workspaceId],
    )
    await db
      .delete(schema.workspaceModel)
      .where(eq(schema.workspaceModel.id, fixture.workspaceId))
    await db
      .delete(schema.userModel)
      .where(eq(schema.userModel.id, fixture.userId))
  }

  const assertPrunesToOneExecutedPartition = async (
    statement: string,
    values: string[],
  ) => {
    await client.query("BEGIN")
    try {
      const plan = await client.query<{ "QUERY PLAN": unknown }>(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement}`,
        values,
      )
      expect(
        new Set(collectExecutedPartitionRelations(plan.rows[0]?.["QUERY PLAN"]))
          .size,
      ).toBe(1)
    } finally {
      await client.query("ROLLBACK")
    }
  }

  beforeEach(async () => {
    const db = createDatabase(client)
    const suffix = `${Date.now()}-${Math.random()}`
    const [user] = await db
      .insert(schema.userModel)
      .values({ email: `contact-inbox-post-${suffix}@example.test` })
      .returning({ id: schema.userModel.id })
    const [workspace] = await db
      .insert(schema.workspaceModel)
      .values({ name: `contact-inbox-post-${suffix}`, ownerId: user.id })
      .returning({ id: schema.workspaceModel.id })
    const [inbox] = await db
      .insert(schema.inboxModel)
      .values({
        channel: "instagram",
        name: `Instagram ${suffix}`,
        sourceId: `instagram-${suffix}`,
        workspaceId: workspace.id,
      })
      .returning({ id: schema.inboxModel.id })
    const [contact] = await db
      .insert(schema.contactModel)
      .values({ workspaceId: workspace.id })
      .returning({ id: schema.contactModel.id })
    const [contactInbox] = await db
      .insert(schema.contactInboxModel)
      .values({
        channel: "instagram",
        contactId: contact.id,
        inboxId: inbox.id,
        originalContactId: contact.id,
        source: "instagram",
        sourceId: `contact-${suffix}`,
      })
      .returning({ id: schema.contactInboxModel.id })
    const externalPostId = `post-${suffix}`
    const [post] = await db
      .insert(schema.channelPostModel)
      .values({
        externalPostId,
        inboxId: inbox.id,
        integrationId: "1",
        integrationType: "instagram",
        sourceAccountId: `account-${suffix}`,
        workspaceId: workspace.id,
      })
      .returning({ id: schema.channelPostModel.id })

    fixture = {
      contactId: contact.id,
      contactInboxId: contactInbox.id,
      externalPostId,
      inboxId: inbox.id,
      postId: post.id,
      userId: user.id,
      workspaceId: workspace.id,
    }
  })

  afterEach(async () => {
    await deleteFixture()
  })

  test("uses 64 workspace hash partitions with the planned key and indexes", async () => {
    const { rows } = await client.query<{
      child_count: string
      index_names: string[]
      partition_columns: string[]
      partition_strategy: string
      primary_key_columns: string[]
    }>(
      `
          SELECT
            (SELECT COUNT(*)::text
               FROM pg_inherits
              WHERE inhparent = '"ContactInboxPost"'::regclass) AS child_count,
            (SELECT array_agg(attribute.attname::text ORDER BY key.ordinality)
               FROM pg_partitioned_table partitioned
               CROSS JOIN LATERAL unnest(partitioned.partattrs::int2[]) WITH ORDINALITY AS key(attnum, ordinality)
               JOIN pg_attribute attribute
                 ON attribute.attrelid = partitioned.partrelid
                AND attribute.attnum = key.attnum
              WHERE partitioned.partrelid = '"ContactInboxPost"'::regclass) AS partition_columns,
            (SELECT partitioned.partstrat::text
               FROM pg_partitioned_table partitioned
              WHERE partitioned.partrelid = '"ContactInboxPost"'::regclass) AS partition_strategy,
            (SELECT array_agg(attribute.attname::text ORDER BY key.ordinality)
               FROM pg_constraint table_constraint
               CROSS JOIN LATERAL unnest(table_constraint.conkey) WITH ORDINALITY AS key(attnum, ordinality)
               JOIN pg_attribute attribute
                 ON attribute.attrelid = table_constraint.conrelid
                AND attribute.attnum = key.attnum
              WHERE table_constraint.conrelid = '"ContactInboxPost"'::regclass
                AND table_constraint.contype = 'p') AS primary_key_columns,
            (SELECT array_agg(index_class.relname::text ORDER BY index_class.relname)
               FROM pg_index index_definition
               JOIN pg_class index_class ON index_class.oid = index_definition.indexrelid
              WHERE index_definition.indrelid = '"ContactInboxPost"'::regclass) AS index_names
      `,
    )
    const catalog = rows[0]

    expect(catalog).toMatchObject({
      child_count: "64",
      partition_columns: ["workspaceId"],
      partition_strategy: "h",
      primary_key_columns: ["workspaceId", "contactInboxId", "postId"],
    })
    expect(catalog?.index_names).toEqual(
      expect.arrayContaining([
        "ContactInboxPost_pkey",
        "ContactInboxPost_workspaceId_postId_idx",
      ]),
    )
  })

  test("prunes workspace-scoped reads for custom and generic plans", async () => {
    const customPlan = await client.query<{ "QUERY PLAN": unknown }>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
       SELECT * FROM "ContactInboxPost" WHERE "workspaceId" = $1`,
      [fixture.workspaceId],
    )
    await client.query(
      `PREPARE contact_inbox_post_workspace_plan(bigint) AS
       SELECT * FROM "ContactInboxPost" WHERE "workspaceId" = $1`,
    )
    try {
      await client.query("SET plan_cache_mode = force_generic_plan")
      const genericPlan = await client.query<{ "QUERY PLAN": unknown }>(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
         EXECUTE contact_inbox_post_workspace_plan(${fixture.workspaceId})`,
      )
      expect(
        new Set(
          collectExecutedPartitionRelations(customPlan.rows[0]?.["QUERY PLAN"]),
        ).size,
      ).toBe(1)
      expect(
        new Set(
          collectExecutedPartitionRelations(
            genericPlan.rows[0]?.["QUERY PLAN"],
          ),
        ).size,
      ).toBe(1)
    } finally {
      await client.query("DEALLOCATE contact_inbox_post_workspace_plan")
      await client.query("RESET plan_cache_mode")
    }
  })

  test("prunes list, count, negative, empty, cleanup, and outer batch-delete paths", async () => {
    const db = createDatabase(client)
    await contactInboxPostRepository.insertIfParentExists(
      {
        channel: "instagram",
        commentedAt: new Date(),
        contactInboxId: fixture.contactInboxId,
        inboxId: fixture.inboxId,
        postId: fixture.postId,
        workspaceId: fixture.workspaceId,
      },
      db,
    )

    await assertPrunesToOneExecutedPartition(
      `SELECT * FROM "ContactInboxPost"
       WHERE "workspaceId" = $1
       ORDER BY "contactInboxId", "postId"
       LIMIT 20`,
      [fixture.workspaceId],
    )
    await assertPrunesToOneExecutedPartition(
      `SELECT COUNT(*) FROM "ContactInboxPost" WHERE "workspaceId" = $1`,
      [fixture.workspaceId],
    )
    // These are the list and count shapes emitted by the Contact filter's
    // `commentedOnPost` eq operator (see commented-on-post.ts), including the
    // `postId = ANY(...)` selected-post predicate production always adds — not
    // merely direct reads of the partitioned table. Keep them as custom plans
    // alongside the generic-plan equivalents below: both paths must execute a
    // single data partition for a workspace-scoped filter.
    await assertPrunesToOneExecutedPartition(
      `SELECT c."id" FROM "Contact" c
       WHERE c."workspaceId" = $1
         AND EXISTS (
           SELECT 1 FROM "ContactInbox" ci
           JOIN "ContactInboxPost" p
             ON p."workspaceId" = $1 AND p."contactInboxId" = ci."id"
           WHERE ci."contactId" = c."id"
             AND p."postId" = ANY(ARRAY[$2]::bigint[])
         )
       LIMIT 20`,
      [fixture.workspaceId, fixture.postId],
    )
    await assertPrunesToOneExecutedPartition(
      `SELECT COUNT(*) FROM "Contact" c
       WHERE c."workspaceId" = $1
         AND EXISTS (
           SELECT 1 FROM "ContactInbox" ci
           JOIN "ContactInboxPost" p
             ON p."workspaceId" = $1 AND p."contactInboxId" = ci."id"
           WHERE ci."contactId" = c."id"
             AND p."postId" = ANY(ARRAY[$2]::bigint[])
         )`,
      [fixture.workspaceId, fixture.postId],
    )
    await assertPrunesToOneExecutedPartition(
      `SELECT ci."contactId"
       FROM "ContactInbox" ci
       WHERE NOT EXISTS (
         SELECT 1 FROM "ContactInboxPost" p
         WHERE p."workspaceId" = $1
           AND p."contactInboxId" = ci."id"
           AND p."postId" = $2
       )`,
      [fixture.workspaceId, fixture.postId],
    )
    await assertPrunesToOneExecutedPartition(
      `SELECT ci."contactId"
       FROM "ContactInbox" ci
       WHERE NOT EXISTS (
         SELECT 1 FROM "ContactInboxPost" p
         WHERE p."workspaceId" = $1 AND p."contactInboxId" = ci."id"
       )`,
      [fixture.workspaceId],
    )
    await assertPrunesToOneExecutedPartition(
      `DELETE FROM "ContactInboxPost"
       WHERE "workspaceId" = $1 AND "contactInboxId" = $2`,
      [fixture.workspaceId, fixture.contactInboxId],
    )
    await assertPrunesToOneExecutedPartition(
      `DELETE FROM "ContactInboxPost"
       WHERE "workspaceId" = $1
         AND ("workspaceId", "contactInboxId", "postId") IN (
           SELECT "workspaceId", "contactInboxId", "postId"
           FROM "ContactInboxPost"
           WHERE "workspaceId" = $1
           ORDER BY "contactInboxId", "postId"
           LIMIT 1000
         )`,
      [fixture.workspaceId],
    )
  })

  test("generic plans prune every production post access shape at execution", async () => {
    const genericStatements = [
      `SELECT c."id" FROM "Contact" c WHERE c."workspaceId" = $1 AND EXISTS (
         SELECT 1 FROM "ContactInbox" ci JOIN "ContactInboxPost" p
           ON p."workspaceId" = $1 AND p."contactInboxId" = ci."id"
         WHERE ci."contactId" = c."id" AND p."postId" = $2) LIMIT 20`,
      `SELECT COUNT(*) FROM "Contact" c WHERE c."workspaceId" = $1 AND EXISTS (
         SELECT 1 FROM "ContactInbox" ci JOIN "ContactInboxPost" p
           ON p."workspaceId" = $1 AND p."contactInboxId" = ci."id"
         WHERE ci."contactId" = c."id" AND p."postId" = $2)`,
      `SELECT ci."contactId" FROM "ContactInbox" ci WHERE NOT EXISTS (
         SELECT 1 FROM "ContactInboxPost" p
         WHERE p."workspaceId" = $1 AND p."contactInboxId" = ci."id")`,
      `SELECT ci."contactId" FROM "ContactInbox" ci WHERE NOT EXISTS (
         SELECT 1 FROM "ContactInboxPost" p
         WHERE p."workspaceId" = $1 AND p."contactInboxId" = ci."id"
           AND p."postId" = $2)`,
      `DELETE FROM "ContactInboxPost" WHERE "workspaceId" = $1
       AND "contactInboxId" = $2`,
      `DELETE FROM "ContactInboxPost" WHERE "workspaceId" = $1
       AND ("workspaceId", "contactInboxId", "postId") IN (
         SELECT "workspaceId", "contactInboxId", "postId" FROM "ContactInboxPost"
         WHERE "workspaceId" = $1 ORDER BY "contactInboxId", "postId" LIMIT 1000)`,
    ]
    await client.query("SET plan_cache_mode = force_generic_plan")
    try {
      for (const [index, statement] of genericStatements.entries()) {
        const name = `contact_inbox_post_generic_${index}`
        const parameters = statement.includes("$2")
          ? `${fixture.workspaceId}, ${statement.includes('"postId" = $2') ? fixture.postId : fixture.contactInboxId}`
          : fixture.workspaceId
        await client.query(
          `PREPARE ${name}(bigint${statement.includes("$2") ? ", bigint" : ""}) AS ${statement}`,
        )
        try {
          const plan = await client.query<{ "QUERY PLAN": unknown }>(
            `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) EXECUTE ${name}(${parameters})`,
          )
          expect(
            new Set(
              collectExecutedPartitionRelations(plan.rows[0]?.["QUERY PLAN"]),
            ).size,
          ).toBe(1)
        } finally {
          await client.query(`DEALLOCATE ${name}`)
        }
      }
    } finally {
      await client.query("RESET plan_cache_mode")
    }
  })

  test("records only workspace-owned parents, keeps the post id on reconnect, and cleans rows", async () => {
    const db = createDatabase(client)
    await expect(
      contactInboxPostRepository.insertIfParentExists(
        {
          channel: "instagram",
          commentedAt: new Date(),
          contactInboxId: fixture.contactInboxId,
          inboxId: fixture.inboxId,
          postId: fixture.postId,
          workspaceId: fixture.workspaceId,
        },
        db,
      ),
    ).resolves.toBe(true)
    await expect(
      contactInboxPostRepository.insertIfParentExists(
        {
          channel: "instagram",
          commentedAt: new Date(),
          contactInboxId: fixture.contactInboxId,
          inboxId: fixture.inboxId,
          postId: fixture.postId,
          workspaceId: "999999999999",
        },
        db,
      ),
    ).resolves.toBe(false)

    await channelPostRepository.updateIntegrationIfChanged(
      {
        externalPostId: fixture.externalPostId,
        inboxId: fixture.inboxId,
        integrationId: "2",
        integrationType: "instagramFacebook",
        sourceAccountId: "reconnected-account",
        workspaceId: fixture.workspaceId,
      },
      db,
    )
    const [post] = await db
      .select({
        id: schema.channelPostModel.id,
        integrationId: schema.channelPostModel.integrationId,
      })
      .from(schema.channelPostModel)
      .where(eq(schema.channelPostModel.id, fixture.postId))
    expect(post).toEqual({ id: fixture.postId, integrationId: "2" })

    await expect(
      contactInboxPostRepository.deleteByContactInboxIds(
        {
          contactInboxIds: [fixture.contactInboxId],
          workspaceId: fixture.workspaceId,
        },
        db,
      ),
    ).resolves.toBe(1)
  })

  test("filters only the selected post in its workspace", async () => {
    const db = createDatabase(client)
    const [emptyContact] = await db
      .insert(schema.contactModel)
      .values({ workspaceId: fixture.workspaceId })
      .returning({ id: schema.contactModel.id })
    await db.insert(schema.contactInboxModel).values({
      channel: "instagram",
      contactId: emptyContact.id,
      inboxId: fixture.inboxId,
      originalContactId: emptyContact.id,
      source: "instagram",
      sourceId: `empty-${Date.now()}-${Math.random()}`,
    })
    await contactInboxPostRepository.insertIfParentExists(
      {
        channel: "instagram",
        commentedAt: new Date(),
        contactInboxId: fixture.contactInboxId,
        inboxId: fixture.inboxId,
        postId: fixture.postId,
        workspaceId: fixture.workspaceId,
      },
      db,
    )
    const criteria = {
      conditions: [
        {
          field: "commentedOnPost",
          operator: "eq",
          value: [fixture.postId],
        },
      ],
      operator: "and",
    } satisfies Parameters<typeof applyContactFilter>[0]
    const where = applyContactFilter(criteria, fixture.workspaceId)
    const sqlWhere = relationsFilterToSQL(schema.contactModel, where as never)
    if (!sqlWhere) {
      throw new Error("Expected commentedOnPost filter SQL")
    }

    const matches = await db
      .select({ id: schema.contactModel.id })
      .from(schema.contactModel)
      .where(
        and(eq(schema.contactModel.workspaceId, fixture.workspaceId), sqlWhere),
      )
    expect(matches).toEqual([{ id: fixture.contactId }])

    for (const [operator, expectedId] of [
      ["ne", emptyContact.id],
      ["isEmpty", emptyContact.id],
    ] as const) {
      const alternativeCriteria = {
        conditions: [
          {
            field: "commentedOnPost",
            operator,
            ...(operator === "ne" ? { value: [fixture.postId] } : {}),
          },
        ],
        operator: "and",
      } satisfies Parameters<typeof applyContactFilter>[0]
      const alternativeWhere = relationsFilterToSQL(
        schema.contactModel,
        applyContactFilter(alternativeCriteria, fixture.workspaceId) as never,
      )
      const alternativeMatches = await db
        .select({ id: schema.contactModel.id })
        .from(schema.contactModel)
        .where(
          and(
            eq(schema.contactModel.workspaceId, fixture.workspaceId),
            alternativeWhere,
          ),
        )
      expect(alternativeMatches).toEqual([{ id: expectedId }])
    }

    const wrongWorkspaceMatches = await db
      .select({ id: schema.contactModel.id })
      .from(schema.contactModel)
      .where(
        and(
          eq(schema.contactModel.workspaceId, fixture.workspaceId),
          relationsFilterToSQL(
            schema.contactModel,
            applyContactFilter(criteria, "999999999999") as never,
          ),
        ),
      )
    expect(wrongWorkspaceMatches).toEqual([])
  })

  test("keeps post filters isolated across workspaces after a reconnect and a new comment", async () => {
    const db = createDatabase(client)
    const suffix = `other-workspace-${Date.now()}-${Math.random()}`
    const [otherUser] = await db
      .insert(schema.userModel)
      .values({ email: `${suffix}@example.test` })
      .returning({ id: schema.userModel.id })
    const [otherWorkspace] = await db
      .insert(schema.workspaceModel)
      .values({ name: suffix, ownerId: otherUser.id })
      .returning({ id: schema.workspaceModel.id })

    try {
      const [otherInbox] = await db
        .insert(schema.inboxModel)
        .values({
          channel: "instagram",
          name: `Instagram ${suffix}`,
          sourceId: suffix,
          workspaceId: otherWorkspace.id,
        })
        .returning({ id: schema.inboxModel.id })
      const [otherContact] = await db
        .insert(schema.contactModel)
        .values({ workspaceId: otherWorkspace.id })
        .returning({ id: schema.contactModel.id })
      const [otherContactInbox] = await db
        .insert(schema.contactInboxModel)
        .values({
          channel: "instagram",
          contactId: otherContact.id,
          inboxId: otherInbox.id,
          originalContactId: otherContact.id,
          source: "instagram",
          sourceId: `contact-${suffix}`,
        })
        .returning({ id: schema.contactInboxModel.id })
      const [otherPost] = await db
        .insert(schema.channelPostModel)
        .values({
          externalPostId: `post-${suffix}`,
          inboxId: otherInbox.id,
          integrationId: "1",
          integrationType: "instagram",
          sourceAccountId: suffix,
          workspaceId: otherWorkspace.id,
        })
        .returning({ id: schema.channelPostModel.id })

      await contactInboxPostRepository.insertIfParentExists(
        {
          channel: "instagram",
          commentedAt: new Date(),
          contactInboxId: fixture.contactInboxId,
          inboxId: fixture.inboxId,
          postId: fixture.postId,
          workspaceId: fixture.workspaceId,
        },
        db,
      )
      await contactInboxPostRepository.insertIfParentExists(
        {
          channel: "instagram",
          commentedAt: new Date(),
          contactInboxId: otherContactInbox.id,
          inboxId: otherInbox.id,
          postId: otherPost.id,
          workspaceId: otherWorkspace.id,
        },
        db,
      )

      const criteria = {
        conditions: [
          { field: "commentedOnPost", operator: "eq", value: [fixture.postId] },
        ],
        operator: "and",
      } satisfies Parameters<typeof applyContactFilter>[0]
      const filterWhere = relationsFilterToSQL(
        schema.contactModel,
        applyContactFilter(criteria, fixture.workspaceId) as never,
      )
      const matchingIds = async () =>
        await db
          .select({ id: schema.contactModel.id })
          .from(schema.contactModel)
          .where(
            and(
              eq(schema.contactModel.workspaceId, fixture.workspaceId),
              filterWhere,
            ),
          )

      expect(await matchingIds()).toEqual([{ id: fixture.contactId }])
      await channelPostRepository.updateIntegrationIfChanged(
        {
          externalPostId: fixture.externalPostId,
          inboxId: fixture.inboxId,
          integrationId: "2",
          integrationType: "instagramFacebook",
          sourceAccountId: "reconnected-account",
          workspaceId: fixture.workspaceId,
        },
        db,
      )
      // A new comment after reconnect is deduplicated by the immutable post id.
      await expect(
        contactInboxPostRepository.insertIfParentExists(
          {
            channel: "instagram",
            commentedAt: new Date(),
            contactInboxId: fixture.contactInboxId,
            inboxId: fixture.inboxId,
            postId: fixture.postId,
            workspaceId: fixture.workspaceId,
          },
          db,
        ),
      ).resolves.toBe(false)
      expect(await matchingIds()).toEqual([{ id: fixture.contactId }])
    } finally {
      await client.query(
        `DELETE FROM "ContactInboxPost" WHERE "workspaceId" = $1`,
        [otherWorkspace.id],
      )
      await db
        .delete(schema.workspaceModel)
        .where(eq(schema.workspaceModel.id, otherWorkspace.id))
      await db
        .delete(schema.userModel)
        .where(eq(schema.userModel.id, otherUser.id))
    }
  })

  test("deletes post rows before parent deletion and a repeated workspace drain is empty", async () => {
    const db = createDatabase(client)
    await contactInboxPostRepository.insertIfParentExists(
      {
        channel: "instagram",
        commentedAt: new Date(),
        contactInboxId: fixture.contactInboxId,
        inboxId: fixture.inboxId,
        postId: fixture.postId,
        workspaceId: fixture.workspaceId,
      },
      db,
    )

    await db.transaction(async (tx) => {
      await contactInboxPostRepository.deleteByContactInboxIds(
        {
          contactInboxIds: [fixture.contactInboxId],
          workspaceId: fixture.workspaceId,
        },
        tx,
      )
      await tx
        .delete(schema.contactModel)
        .where(eq(schema.contactModel.id, fixture.contactId))
    })
    expect(
      await client.query(
        `SELECT 1 FROM "ContactInboxPost" WHERE "workspaceId" = $1`,
        [fixture.workspaceId],
      ),
    ).toMatchObject({ rowCount: 0 })

    // Recreate one row after the contact-delete path so the workspace drain is
    // exercised with a real residue, then prove its second invocation is a
    // no-op. This is the exact ctid-key batch shape used by the purge service.
    const [purgeContact] = await db
      .insert(schema.contactModel)
      .values({ workspaceId: fixture.workspaceId })
      .returning({ id: schema.contactModel.id })
    const [purgeContactInbox] = await db
      .insert(schema.contactInboxModel)
      .values({
        channel: "instagram",
        contactId: purgeContact.id,
        inboxId: fixture.inboxId,
        originalContactId: purgeContact.id,
        source: "instagram",
        sourceId: `purge-${Date.now()}-${Math.random()}`,
      })
      .returning({ id: schema.contactInboxModel.id })
    await expect(
      contactInboxPostRepository.insertIfParentExists(
        {
          channel: "instagram",
          commentedAt: new Date(),
          contactInboxId: purgeContactInbox.id,
          inboxId: fixture.inboxId,
          postId: fixture.postId,
          workspaceId: fixture.workspaceId,
        },
        db,
      ),
    ).resolves.toBe(true)

    const firstDrain = await client.query(
      `DELETE FROM "ContactInboxPost"
       WHERE "workspaceId" = $1
         AND ("workspaceId", "contactInboxId", "postId") IN (
           SELECT "workspaceId", "contactInboxId", "postId"
           FROM "ContactInboxPost"
           WHERE "workspaceId" = $1
           ORDER BY "contactInboxId", "postId"
           LIMIT 500
         )`,
      [fixture.workspaceId],
    )
    const secondDrain = await client.query(
      `DELETE FROM "ContactInboxPost"
       WHERE "workspaceId" = $1
         AND ("workspaceId", "contactInboxId", "postId") IN (
           SELECT "workspaceId", "contactInboxId", "postId"
           FROM "ContactInboxPost"
           WHERE "workspaceId" = $1
           ORDER BY "contactInboxId", "postId"
           LIMIT 500
         )`,
      [fixture.workspaceId],
    )
    expect(firstDrain.rowCount).toBe(1)
    expect(secondDrain.rowCount).toBe(0)
  })

  test("serializes contact deletion against writers in either order without orphan rows", async () => {
    const writerDb = createDatabase(writerClient)
    const deleterDb = createDatabase(purgeClient)

    // Deleter first: it holds the ContactInbox lock until it removes the row;
    // a concurrent writer must resume as a no-op once the parent is gone.
    let purgeTransactionOpen = false
    let writerAfterDelete: Promise<boolean> | undefined
    try {
      await purgeClient.query("BEGIN")
      purgeTransactionOpen = true
      await purgeClient.query(
        `SELECT ci."id" FROM "Contact" c
         JOIN "ContactInbox" ci ON ci."contactId" = c."id"
         WHERE c."id" = $1 FOR UPDATE OF c, ci`,
        [fixture.contactId],
      )
      const [{ pid: writerPid }] = (
        await writerClient.query<{ pid: number }>(
          "SELECT pg_backend_pid() AS pid",
        )
      ).rows
      writerAfterDelete = (async () => {
        await writerClient.query("BEGIN")
        try {
          const result = await contactInboxPostRepository.insertIfParentExists(
            {
              channel: "instagram",
              commentedAt: new Date(),
              contactInboxId: fixture.contactInboxId,
              inboxId: fixture.inboxId,
              postId: fixture.postId,
              workspaceId: fixture.workspaceId,
            },
            writerDb,
          )
          await writerClient.query("COMMIT")
          return result
        } catch (error) {
          await writerClient.query("ROLLBACK")
          throw error
        }
      })()
      await waitForLock(client, writerPid)
      await contactInboxPostRepository.deleteByContactInboxIds(
        {
          contactInboxIds: [fixture.contactInboxId],
          workspaceId: fixture.workspaceId,
        },
        deleterDb,
      )
      await purgeClient.query(`DELETE FROM "Contact" WHERE "id" = $1`, [
        fixture.contactId,
      ])
      await purgeClient.query("COMMIT")
      purgeTransactionOpen = false
      await expect(writerAfterDelete).resolves.toBe(false)
    } finally {
      if (purgeTransactionOpen) {
        await purgeClient.query("ROLLBACK")
      }
      await writerAfterDelete?.catch(() => undefined)
    }
    expect(
      await client.query(
        `SELECT 1 FROM "ContactInboxPost" WHERE "workspaceId" = $1`,
        [fixture.workspaceId],
      ),
    ).toMatchObject({ rowCount: 0 })
  })

  test("waits for an inserter-first post write before deleting its contact", async () => {
    const writerDb = createDatabase(writerClient)
    const deleterDb = createDatabase(purgeClient)
    const inserted = Promise.withResolvers<void>()
    const releaseWriter = Promise.withResolvers<void>()
    const writerTransaction = (async () => {
      await writerClient.query("BEGIN")
      try {
        expect(
          await contactInboxPostRepository.lockWorkspaceForPostWrite(
            { workspaceId: fixture.workspaceId },
            writerDb,
          ),
        ).toBe(true)
        expect(
          await contactInboxPostRepository.insertIfParentExists(
            {
              channel: "instagram",
              commentedAt: new Date(),
              contactInboxId: fixture.contactInboxId,
              inboxId: fixture.inboxId,
              postId: fixture.postId,
              workspaceId: fixture.workspaceId,
            },
            writerDb,
          ),
        ).toBe(true)
        inserted.resolve()
        await releaseWriter.promise
        await writerClient.query("COMMIT")
      } catch (error) {
        await writerClient.query("ROLLBACK")
        throw error
      }
    })()
    await inserted.promise

    const [{ pid: deleterPid }] = (
      await purgeClient.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
    ).rows
    const deleterTransaction = (async () => {
      await purgeClient.query("BEGIN")
      try {
        await contactInboxPostRepository.lockContactsForDelete(
          { contactIds: [fixture.contactId], workspaceId: fixture.workspaceId },
          deleterDb,
        )
        const contactInboxIds =
          await contactInboxPostRepository.lockContactInboxIdsByContactIds(
            {
              contactIds: [fixture.contactId],
              workspaceId: fixture.workspaceId,
            },
            deleterDb,
          )
        await contactInboxPostRepository.deleteByContactInboxIds(
          { contactInboxIds, workspaceId: fixture.workspaceId },
          deleterDb,
        )
        await purgeClient.query(`DELETE FROM "Contact" WHERE "id" = $1`, [
          fixture.contactId,
        ])
        await purgeClient.query("COMMIT")
      } catch (error) {
        await purgeClient.query("ROLLBACK")
        throw error
      }
    })()

    try {
      await waitForLock(client, deleterPid)
    } finally {
      releaseWriter.resolve()
      await Promise.all([writerTransaction, deleterTransaction])
    }
    expect(
      await client.query(
        `SELECT 1 FROM "ContactInboxPost" WHERE "workspaceId" = $1`,
        [fixture.workspaceId],
      ),
    ).toMatchObject({ rowCount: 0 })
  })

  test("rejects a new ContactInbox that races an in-progress contact deletion", async () => {
    const suffix = `contact-inbox-race-${Date.now()}-${Math.random()}`
    const writerDb = createDatabase(writerClient)
    await purgeClient.query("BEGIN")
    try {
      await purgeClient.query(
        `SELECT "id" FROM "Contact" WHERE "id" = $1 FOR UPDATE`,
        [fixture.contactId],
      )
      const [{ pid: writerPid }] = (
        await writerClient.query<{ pid: number }>(
          "SELECT pg_backend_pid() AS pid",
        )
      ).rows
      // Go through Drizzle so sharedColumns.id is generated; PostgreSQL has
      // no physical default for this application-side id.
      const insertContactInbox = (async () =>
        await writerDb.insert(schema.contactInboxModel).values({
          channel: "instagram",
          contactId: fixture.contactId,
          inboxId: fixture.inboxId,
          originalContactId: fixture.contactId,
          source: "instagram",
          sourceId: suffix,
        }))()
      await waitForLock(client, writerPid)
      await purgeClient.query(`DELETE FROM "Contact" WHERE "id" = $1`, [
        fixture.contactId,
      ])
      await purgeClient.query("COMMIT")
      await expect(insertContactInbox).rejects.toMatchObject({
        cause: { code: "23503" },
      })
    } catch (error) {
      await purgeClient.query("ROLLBACK")
      throw error
    }
    expect(
      await client.query(
        `SELECT 1 FROM "ContactInboxPost" WHERE "workspaceId" = $1`,
        [fixture.workspaceId],
      ),
    ).toMatchObject({ rowCount: 0 })
  })

  test("rejects cancellation after a concurrent purge fence commits", async () => {
    await client.query(
      `UPDATE "Workspace" SET "scheduledDeletionAt" = NOW() - INTERVAL '1 minute'
       WHERE "id" = $1`,
      [fixture.workspaceId],
    )
    await purgeClient.query("BEGIN")
    try {
      await purgeClient.query(
        `SELECT "id" FROM "Workspace" WHERE "id" = $1 FOR UPDATE`,
        [fixture.workspaceId],
      )
      await purgeClient.query(
        `UPDATE "Workspace" SET "purgeStartedAt" = NOW() WHERE "id" = $1`,
        [fixture.workspaceId],
      )
      const [{ pid: cancellationPid }] = (
        await writerClient.query<{ pid: number }>(
          "SELECT pg_backend_pid() AS pid",
        )
      ).rows
      const cancel = writerClient.query(
        `UPDATE "Workspace" SET "scheduledDeletionAt" = NULL
         WHERE "id" = $1 AND "purgeStartedAt" IS NULL`,
        [fixture.workspaceId],
      )
      await waitForLock(client, cancellationPid)
      await purgeClient.query("COMMIT")
      await expect(cancel).resolves.toMatchObject({ rowCount: 0 })
    } catch (error) {
      await purgeClient.query("ROLLBACK")
      throw error
    }
    const { rows } = await client.query<{ purgeStartedAt: Date | null }>(
      `SELECT "purgeStartedAt" FROM "Workspace" WHERE "id" = $1`,
      [fixture.workspaceId],
    )
    expect(rows[0]?.purgeStartedAt).toBeInstanceOf(Date)
  })

  test("makes the durable workspace purge fence visible to post writers", async () => {
    const db = createDatabase(client)
    await db
      .update(schema.workspaceModel)
      .set({ purgeStartedAt: new Date() })
      .where(eq(schema.workspaceModel.id, fixture.workspaceId))

    await expect(
      contactInboxPostRepository.lockWorkspaceForPostWrite(
        { workspaceId: fixture.workspaceId },
        db,
      ),
    ).resolves.toBe(false)
  })

  test("waits for an in-flight writer before starting the workspace purge fence", async () => {
    const writerLocked = Promise.withResolvers<void>()
    const releaseWriter = Promise.withResolvers<void>()
    const writerTransaction = (async () => {
      await writerClient.query("BEGIN")
      try {
        await writerClient.query(
          `SELECT "id" FROM "Workspace" WHERE "id" = $1 FOR KEY SHARE`,
          [fixture.workspaceId],
        )
        writerLocked.resolve()
        await releaseWriter.promise
        await writerClient.query("COMMIT")
      } catch (error) {
        await writerClient.query("ROLLBACK")
        throw error
      }
    })()
    await writerLocked.promise

    const [{ pid: purgePid }] = (
      await purgeClient.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
    ).rows
    const purgeTransaction = (async () => {
      await purgeClient.query("BEGIN")
      try {
        await purgeClient.query(
          `SELECT "id" FROM "Workspace" WHERE "id" = $1 FOR UPDATE`,
          [fixture.workspaceId],
        )
        await purgeClient.query(
          `UPDATE "Workspace" SET "purgeStartedAt" = NOW() WHERE "id" = $1`,
          [fixture.workspaceId],
        )
        await purgeClient.query("COMMIT")
      } catch (error) {
        await purgeClient.query("ROLLBACK")
        throw error
      }
    })()

    try {
      await waitForLock(client, purgePid)
    } finally {
      releaseWriter.resolve()
      await Promise.allSettled([writerTransaction, purgeTransaction])
    }

    await expect(
      contactInboxPostRepository.lockWorkspaceForPostWrite(
        { workspaceId: fixture.workspaceId },
        createDatabase(client),
      ),
    ).resolves.toBe(false)
  })

  test("does not block ordinary workspace updates behind a post writer key-share lock", async () => {
    await writerClient.query("BEGIN")
    try {
      await writerClient.query(
        `SELECT "id" FROM "Workspace" WHERE "id" = $1 FOR KEY SHARE`,
        [fixture.workspaceId],
      )
      await expect(
        purgeClient.query(
          `UPDATE "Workspace" SET "name" = $2 WHERE "id" = $1`,
          [fixture.workspaceId, `updated-${Date.now()}`],
        ),
      ).resolves.toBeDefined()
    } finally {
      await writerClient.query("ROLLBACK")
    }
  })

  test("persists Instagram snapshot fields with their nullable tri-state", async () => {
    const db = createDatabase(client)
    await db
      .update(schema.contactInboxModel)
      .set({
        followsBusiness: true,
        followerCount: 42,
        businessFollowsContact: false,
        profileSnapshotAttempts: 1,
        profileSnapshotState: "captured",
        accountVerified: null,
      })
      .where(eq(schema.contactInboxModel.id, fixture.contactInboxId))
    const [contactInbox] = await db
      .select({
        followsBusiness: schema.contactInboxModel.followsBusiness,
        followerCount: schema.contactInboxModel.followerCount,
        businessFollowsContact: schema.contactInboxModel.businessFollowsContact,
        accountVerified: schema.contactInboxModel.accountVerified,
      })
      .from(schema.contactInboxModel)
      .where(eq(schema.contactInboxModel.id, fixture.contactInboxId))

    expect(contactInbox).toEqual({
      followsBusiness: true,
      followerCount: 42,
      businessFollowsContact: false,
      accountVerified: null,
    })

    for (const condition of [
      { field: "followsBusinessOnInstagram", operator: "eq", value: "true" },
      { field: "followerCountOnInstagram", operator: "gt", value: "40" },
      { field: "verifiedAccountOnInstagram", operator: "isEmpty" },
    ] satisfies Parameters<typeof applyContactFilter>[0]["conditions"]) {
      const filter = {
        conditions: [condition],
        operator: "and",
      } satisfies Parameters<typeof applyContactFilter>[0]
      const where = relationsFilterToSQL(
        schema.contactModel,
        applyContactFilter(filter, fixture.workspaceId) as never,
      )
      const matches = await db
        .select({ id: schema.contactModel.id })
        .from(schema.contactModel)
        .where(
          and(eq(schema.contactModel.workspaceId, fixture.workspaceId), where),
        )
      expect(matches).toEqual([{ id: fixture.contactId }])
    }
  })
})
