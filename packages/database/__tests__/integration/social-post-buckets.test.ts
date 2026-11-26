// @vitest-environment node

/**
 * The posts list's buckets and the planned time of a draft, against a real
 * database: the grouped count and the list filter agree on which post is in
 * which bucket, and a draft that remembers a time still has no clock, so no
 * scan, claim or missed-schedule sweep can ever publish it.
 *
 * Runs only against an explicitly configured local database:
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { SocialPostBucket } from "../../src/partials/social-post"
import { relations } from "../../src/relations"
import { socialPostPublishRepository as publishRepo } from "../../src/repositories/social-post/publishing"
import { socialPostRepository } from "../../src/repositories/social-post/repository"
import { socialPostSchedulingRepository as schedulingRepo } from "../../src/repositories/social-post/scheduling"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"
import { insertPublishDestination } from "./publish-destination-fixture"

const databaseUrl = realDatabaseUrl()
const MINUTE = 60_000
const HOUR = 60 * MINUTE

describe.skipIf(!databaseUrl)("post buckets and draft planned time", () => {
  let client: Client
  let workspaceId: string
  let userId: string
  let destinationId: string
  let sequence = 0
  const nextId = () => `${Date.now()}${String(++sequence).padStart(6, "0")}`
  const database = () => drizzle({ client, relations, schema })

  const post = async (input: {
    postStatus: string
    targetStatus: string
    nextAttemptAt?: Date | null
    scheduledAt?: Date | null
  }) => {
    const postId = nextId()
    const targetId = nextId()
    await socialPostRepository.insertPost(
      {
        createdById: null,
        createdVia: "api",
        id: postId,
        idempotencyKey: null,
        idempotencyRequestHash: null,
        linkUrl: null,
        text: "hello",
        workspaceId,
      },
      database() as never,
    )
    await client.query(`UPDATE "SocialPost" SET "status" = $2 WHERE id = $1`, [
      postId,
      input.postStatus,
    ])
    await client.query(
      `INSERT INTO "SocialPostTarget" ("id","socialPostId","workspaceId","publishDestinationId","provider","contentType","status","nextAttemptAt","scheduledAt")
       VALUES ($1,$2,$3,$4,'facebook','text',$5,$6,$7)`,
      [
        targetId,
        postId,
        workspaceId,
        destinationId,
        input.targetStatus,
        input.nextAttemptAt ?? null,
        input.scheduledAt ?? null,
      ],
    )
    return { postId, targetId }
  }

  const target = async (id: string) =>
    (await client.query(`SELECT * FROM "SocialPostTarget" WHERE id = $1`, [id]))
      .rows[0]

  const listIds = async (bucket: SocialPostBucket) =>
    (
      await socialPostRepository.list({
        filters: { bucket },
        limit: 100,
        workspaceId,
      })
    ).map((row) => row.id)

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl as string })
    await client.connect()
    const db = database()
    const suffix = `${Date.now()}-${Math.random()}`
    const [user] = await db
      .insert(schema.userModel)
      .values({ email: `bucket-${suffix}@example.test` })
      .returning({ id: schema.userModel.id })
    userId = user.id
    const [workspace] = await db
      .insert(schema.workspaceModel)
      .values({ name: `bucket-${suffix}`, ownerId: user.id })
      .returning({ id: schema.workspaceModel.id })
    workspaceId = workspace.id
    destinationId = await insertPublishDestination(db, {
      label: "bucket",
      workspaceId,
    })
  })

  afterAll(async () => {
    if (workspaceId) {
      const db = database()
      await client.query(
        `DELETE FROM "SocialPostTarget" WHERE "workspaceId" = $1`,
        [workspaceId],
      )
      await client.query(`DELETE FROM "SocialPost" WHERE "workspaceId" = $1`, [
        workspaceId,
      ])
      await db
        .delete(schema.workspaceModel)
        .where(eq(schema.workspaceModel.id, workspaceId))
      await db.delete(schema.userModel).where(eq(schema.userModel.id, userId))
    }
    await client.end()
  })

  test("a post is in exactly one bucket, and count and list agree", async () => {
    const future = new Date(Date.now() + HOUR)
    const draft = await post({ postStatus: "draft", targetStatus: "pending" })
    const scheduled = await post({
      nextAttemptAt: future,
      postStatus: "scheduled",
      scheduledAt: future,
      targetStatus: "pending",
    })
    const published = await post({
      postStatus: "published",
      targetStatus: "published",
    })
    const failed = await post({ postStatus: "failed", targetStatus: "failed" })
    const review = await post({
      postStatus: "publishing",
      targetStatus: "needsReview",
    })
    await post({ postStatus: "cancelled", targetStatus: "cancelled" })

    const counts = await socialPostRepository.countByBucket({
      filters: {},
      workspaceId,
    })

    expect(counts).toEqual({
      all: 6,
      drafts: 1,
      needsAttention: 2,
      published: 1,
      scheduled: 1,
    })
    expect(await listIds("drafts")).toEqual([draft.postId])
    expect(await listIds("scheduled")).toEqual([scheduled.postId])
    expect(await listIds("published")).toEqual([published.postId])
    expect((await listIds("needsAttention")).sort()).toEqual(
      [failed.postId, review.postId].sort(),
    )
  })

  test("counts never include another workspace's posts", async () => {
    const counts = await socialPostRepository.countByBucket({
      filters: {},
      workspaceId: nextId(),
    })

    expect(counts).toEqual({
      all: 0,
      drafts: 0,
      needsAttention: 0,
      published: 0,
      scheduled: 0,
    })
  })

  test("a draft with a planned time keeps no clock and can never be published", async () => {
    const { postId, targetId } = await post({
      postStatus: "draft",
      targetStatus: "pending",
    })
    const planned = new Date(Date.now() - 2 * HOUR)

    const written = await schedulingRepo.setPlannedTime(
      {
        plannedAt: planned,
        socialPostId: postId,
        timezone: "Asia/Ho_Chi_Minh",
        workspaceId,
      },
      database() as never,
    )

    expect(written).toBe(1)
    const stored = await target(targetId)
    expect(stored.scheduledAt).toEqual(planned)
    expect(stored.nextAttemptAt).toBeNull()
    expect(stored.status).toBe("pending")

    const now = new Date()
    const due = await publishRepo.claimDue({
      lateCutoff: new Date(0),
      limit: 1000,
      now,
      pushBackUntil: new Date(now.getTime() + 5 * MINUTE),
    })
    expect(due.map((item) => item.id)).not.toContain(targetId)
    const missed = await schedulingRepo.listMissed({
      cutoff: new Date(now.getTime() + HOUR),
      limit: 1000,
    })
    expect(missed.map((item) => item.id)).not.toContain(targetId)
    const claimed = await publishRepo.claim({
      lateCutoff: new Date(0),
      id: targetId,
      leaseUntil: new Date(now.getTime() + MINUTE),
      now,
      workspaceId,
    })
    expect(claimed).toBeNull()
    expect((await target(targetId)).status).toBe("pending")
  })

  test("a planned time leaves a target that already has a clock alone", async () => {
    const future = new Date(Date.now() + HOUR)
    const { postId, targetId } = await post({
      nextAttemptAt: future,
      postStatus: "scheduled",
      scheduledAt: future,
      targetStatus: "pending",
    })

    const written = await schedulingRepo.setPlannedTime(
      {
        plannedAt: new Date(Date.now() + 5 * HOUR),
        socialPostId: postId,
        timezone: "UTC",
        workspaceId,
      },
      database() as never,
    )

    expect(written).toBe(0)
    expect((await target(targetId)).scheduledAt).toEqual(future)
  })
})
