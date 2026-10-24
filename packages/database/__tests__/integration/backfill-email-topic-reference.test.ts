// @vitest-environment node

/**
 * Real-SQL check for the `topicReferenceId` backfill: it fills only rows that
 * still have a topic, is idempotent, and honours the workspace scope.
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest"
// @ts-expect-error plain .mjs script, no type declarations
import { backfillEmailTopicReference } from "../../scripts/backfill-email-topic-reference.mjs"
import { relations } from "../../src/relations"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

describe.skipIf(!databaseUrl)("backfill email topic reference", () => {
  let pool: Pool
  const cleanup: Array<() => Promise<unknown>> = []

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl as string })
  })

  afterEach(async () => {
    for (const task of cleanup.splice(0).reverse()) {
      await task()
    }
  })

  afterAll(async () => {
    await pool?.end()
  })

  const database = () => drizzle({ client: pool, relations, schema })

  const createFixture = async () => {
    const db = database()
    const suffix = `${Date.now()}-${Math.random()}`
    const [user] = await db
      .insert(schema.userModel)
      .values({ email: `email-topic-backfill-${suffix}@example.test` })
      .returning({ id: schema.userModel.id })
    const [workspace] = await db
      .insert(schema.workspaceModel)
      .values({ name: `email-topic-backfill-${suffix}`, ownerId: user.id })
      .returning({ id: schema.workspaceModel.id })
    const [topic] = await db
      .insert(schema.emailTopicModel)
      .values({ name: `topic-${suffix}`, workspaceId: workspace.id })
      .returning({ id: schema.emailTopicModel.id })
    cleanup.push(async () => {
      await db
        .delete(schema.workspaceModel)
        .where(eq(schema.workspaceModel.id, workspace.id))
      await db.delete(schema.userModel).where(eq(schema.userModel.id, user.id))
    })

    const recipient = async (topicId: string | null, token: string) => {
      const [row] = await db
        .insert(schema.analyticsEmailTopicModel)
        .values({
          email: "a@b.test",
          token: `${token}-${suffix}`,
          topicId,
          workspaceId: workspace.id,
        })
        .returning({ id: schema.analyticsEmailTopicModel.id })
      return row.id
    }

    return { recipient, topicId: topic.id, workspaceId: workspace.id }
  }

  const referenceOf = async (id: string) =>
    (
      await pool.query<{ topicReferenceId: string | null }>(
        `SELECT "topicReferenceId" FROM "AnalyticsEmailTopic" WHERE "id" = $1`,
        [id],
      )
    ).rows[0]?.topicReferenceId

  test("copies the live topic id, skips topic-less rows, and is idempotent", async () => {
    const fixture = await createFixture()
    const withTopic = await fixture.recipient(fixture.topicId, "with")
    const withoutTopic = await fixture.recipient(null, "without")

    const first = await backfillEmailTopicReference(pool, {
      batchSize: 1,
      workspaceId: fixture.workspaceId,
    })
    const second = await backfillEmailTopicReference(pool, {
      workspaceId: fixture.workspaceId,
    })

    expect(first).toEqual({ remaining: 0, updated: 1 })
    expect(second).toEqual({ remaining: 0, updated: 0 })
    expect(await referenceOf(withTopic)).toBe(fixture.topicId)
    expect(await referenceOf(withoutTopic)).toBeNull()
  })

  test("a dry run reports what is left without writing", async () => {
    const fixture = await createFixture()
    const id = await fixture.recipient(fixture.topicId, "dry")

    const result = await backfillEmailTopicReference(pool, {
      dryRun: true,
      workspaceId: fixture.workspaceId,
    })

    expect(result).toEqual({ remaining: 1, updated: 0 })
    expect(await referenceOf(id)).toBeNull()
  })

  test("only touches the requested workspace", async () => {
    const mine = await createFixture()
    const other = await createFixture()
    const otherId = await other.recipient(other.topicId, "other")
    await mine.recipient(mine.topicId, "mine")

    await backfillEmailTopicReference(pool, { workspaceId: mine.workspaceId })

    expect(await referenceOf(otherId)).toBeNull()
  })
})
