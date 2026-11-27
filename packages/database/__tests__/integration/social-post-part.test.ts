// @vitest-environment node

/**
 * The follow-up parts of a target against a real database: unique positions,
 * one first comment, real column defaults, the ordered claim (a part starts only
 * after every earlier part is published and only while its target is
 * `processing`), the per-part fence, and the cascade from the target.
 *
 * Runs only against an explicitly configured local database after the approved
 * migrations were applied: `pnpm --filter @chatbotx.io/database test:db`.
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { relations } from "../../src/relations"
import { socialPostPartRepository } from "../../src/repositories/social-post/parts"
import { socialPostRepository } from "../../src/repositories/social-post/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"
import { insertPublishDestination } from "./publish-destination-fixture"

const databaseUrl = realDatabaseUrl()

describe.skipIf(!databaseUrl)("target parts against a real database", () => {
  let client: Client
  let workspaceId: string
  let userId: string
  let destinationId: string
  let sequence = 0
  const nextId = () => `${Date.now()}${String(++sequence).padStart(6, "0")}`
  const database = () => drizzle({ client, relations, schema })
  const LEASE = new Date("2030-01-01T00:10:00Z")
  /** `now` and the scan's push-back window every claim presents. */
  const DUE = { dueWindowMs: 5 * 60 * 1000, now: new Date() }

  /** A published-head target (`processing`) with `count` thread parts, all pending. */
  const targetWithParts = async (count: number) => {
    const db = database()
    const postId = nextId()
    await socialPostRepository.insertPost(
      {
        createdById: null,
        createdVia: "api",
        id: postId,
        idempotencyKey: null,
        idempotencyRequestHash: null,
        linkUrl: null,
        text: "head",
        workspaceId,
      },
      db,
    )
    const targetId = nextId()
    await socialPostRepository.insertTargets(
      [
        {
          contentType: "text",
          id: targetId,
          options: {},
          overridesMedia: false,
          provider: "facebook",
          scheduleMode: "custom",
          publishDestinationId: destinationId,
          socialPostId: postId,
          textOverride: null,
          workspaceId,
        },
      ],
      db,
    )
    await client.query(
      `UPDATE "SocialPostTarget" SET "status" = 'processing', "externalPostId" = 'head-1' WHERE "id" = $1`,
      [targetId],
    )
    const parts = Array.from({ length: count }, (_, index) => ({
      id: nextId(),
      kind: "threadPart" as const,
      position: index + 1,
      socialPostTargetId: targetId,
      text: `part ${index + 1}`,
      workspaceId,
    }))
    await socialPostPartRepository.insertMany(parts, db)
    return { parts, postId, targetId }
  }

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl as string })
    await client.connect()
    const db = database()
    const suffix = `${Date.now()}-${Math.random()}`
    const [user] = await db
      .insert(schema.userModel)
      .values({ email: `part-${suffix}@example.test` })
      .returning({ id: schema.userModel.id })
    const [workspace] = await db
      .insert(schema.workspaceModel)
      .values({ name: `part-${suffix}`, ownerId: user.id })
      .returning({ id: schema.workspaceModel.id })
    const destination = {
      id: await insertPublishDestination(db, {
        label: "mine",
        workspaceId: workspace.id,
      }),
    }
    userId = user.id
    workspaceId = workspace.id
    destinationId = destination.id
  })

  afterAll(async () => {
    if (workspaceId) {
      const db = database()
      await client.query(
        `DELETE FROM "SocialPostTarget" WHERE "workspaceId" = $1`,
        [workspaceId],
      )
      await db
        .delete(schema.workspaceModel)
        .where(eq(schema.workspaceModel.id, workspaceId))
      await db.delete(schema.userModel).where(eq(schema.userModel.id, userId))
    }
    await client.end()
  })

  test("the columns have real SQL defaults", async () => {
    const { parts } = await targetWithParts(1)
    const [row] = (
      await client.query(
        `SELECT "status", "kind", "attemptCount" FROM "SocialPostTargetPart" WHERE "id" = $1`,
        [parts[0]?.id],
      )
    ).rows
    expect(row).toEqual({
      attemptCount: 0,
      kind: "threadPart",
      status: "pending",
    })
    const defaults = (
      await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'SocialPostTargetPart' AND column_default IS NOT NULL`,
      )
    ).rows.map((entry) => entry.column_name)
    expect(defaults).toEqual(
      expect.arrayContaining(["status", "kind", "attemptCount"]),
    )
  })

  test("the delayed check claims a part only while its stored check time is the lease", async () => {
    const { parts } = await targetWithParts(1)
    const partId = parts[0]?.id as string
    const due = new Date(Date.now() + 20_000)
    await client.query(
      `UPDATE "SocialPostTargetPart" SET "status" = 'processing', "leaseExpiresAt" = $2 WHERE "id" = $1`,
      [partId, due],
    )
    const lease = new Date(Date.now() + 10 * 60_000)
    const claim = (expectedDueAt: Date, leaseUntil: Date) =>
      socialPostPartRepository.claimExpired({
        leaseUntil,
        limit: 1,
        now: new Date(),
        only: { expectedDueAt, id: partId, workspaceId },
      })

    const stale = await claim(new Date(due.getTime() + 1), lease)
    const [won, lost] = await Promise.all([
      claim(due, lease),
      claim(due, new Date(lease.getTime() + 1)),
    ])

    expect(stale).toEqual([])
    expect([...won, ...lost]).toHaveLength(1)
    const stored = await client.query(
      `SELECT "leaseExpiresAt" FROM "SocialPostTargetPart" WHERE "id" = $1`,
      [partId],
    )
    expect(stored.rows[0].leaseExpiresAt.getTime()).toBeGreaterThanOrEqual(
      lease.getTime(),
    )
  })

  test("a position is unique per target and a target has one first comment", async () => {
    const { targetId } = await targetWithParts(1)
    const db = database()
    await expect(
      socialPostPartRepository.insertMany(
        [
          {
            id: nextId(),
            kind: "threadPart",
            position: 1,
            socialPostTargetId: targetId,
            text: "again",
            workspaceId,
          },
        ],
        db,
      ),
    ).rejects.toThrow()
    await socialPostPartRepository.insertMany(
      [
        {
          id: nextId(),
          kind: "firstComment",
          position: 2,
          socialPostTargetId: targetId,
          text: "c1",
          workspaceId,
        },
      ],
      db,
    )
    await expect(
      socialPostPartRepository.insertMany(
        [
          {
            id: nextId(),
            kind: "firstComment",
            position: 3,
            socialPostTargetId: targetId,
            text: "c2",
            workspaceId,
          },
        ],
        db,
      ),
    ).rejects.toThrow()
  })

  test("parts are claimed strictly in order, and only while the target is processing", async () => {
    const { parts, targetId } = await targetWithParts(2)
    const db = database()
    const [first, second] = parts
    if (!(first && second)) {
      throw new Error("fixture")
    }
    const claim = (id: string) =>
      socialPostPartRepository.claim(
        { ...DUE, id, leaseUntil: LEASE, workspaceId },
        db,
      )

    // Nothing is due yet: `nextAttemptAt` is the part's turn.
    expect(await claim(first.id)).toBeNull()
    await socialPostPartRepository.startFirst(
      { now: new Date(), socialPostTargetId: targetId, workspaceId },
      db,
    )
    // The second part cannot jump the queue even when it is made due.
    await client.query(
      `UPDATE "SocialPostTargetPart" SET "nextAttemptAt" = now() WHERE "id" = $1`,
      [second.id],
    )
    expect(await claim(second.id)).toBeNull()
    expect(await claim(first.id)).toMatchObject({ attemptCount: 1 })

    // Published: the second may now start.
    expect(
      await socialPostPartRepository.settle(
        {
          fence: LEASE,
          id: first.id,
          outcome: {
            externalPostId: "r1",
            kind: "published",
            permalink: null,
            publishedAt: new Date(),
          },
          workspaceId,
        },
        db,
      ),
    ).toBe(targetId)
    expect(await claim(second.id)).toMatchObject({ attemptCount: 1 })
  })

  test("a target that is not processing blocks its parts", async () => {
    const { parts, targetId } = await targetWithParts(1)
    const db = database()
    await client.query(
      `UPDATE "SocialPostTarget" SET "status" = 'failed' WHERE "id" = $1`,
      [targetId],
    )
    await socialPostPartRepository.startFirst(
      { now: new Date(), socialPostTargetId: targetId, workspaceId },
      db,
    )
    expect(
      await socialPostPartRepository.claim(
        { ...DUE, id: parts[0]?.id ?? "", leaseUntil: LEASE, workspaceId },
        db,
      ),
    ).toBeNull()
  })

  test("a part rescheduled beyond the push-back window is not claimed", async () => {
    const { parts, targetId } = await targetWithParts(1)
    const db = database()
    await socialPostPartRepository.startFirst(
      { now: new Date(), socialPostTargetId: targetId, workspaceId },
      db,
    )
    const id = parts[0]?.id ?? ""
    await client.query(
      `UPDATE "SocialPostTargetPart" SET "nextAttemptAt" = now() + interval '1 hour' WHERE "id" = $1`,
      [id],
    )
    expect(
      await socialPostPartRepository.claim(
        { ...DUE, id, leaseUntil: LEASE, workspaceId },
        db,
      ),
    ).toBeNull()
  })

  test("two workers racing on one part: exactly one wins the claim", async () => {
    const { parts, targetId } = await targetWithParts(1)
    const db = database()
    await socialPostPartRepository.startFirst(
      { now: new Date(), socialPostTargetId: targetId, workspaceId },
      db,
    )
    const id = parts[0]?.id ?? ""
    // Two connections, so the statements really overlap.
    const other = new Client({ connectionString: databaseUrl as string })
    await other.connect()
    try {
      const results = await Promise.all([
        socialPostPartRepository.claim(
          { ...DUE, id, leaseUntil: LEASE, workspaceId },
          drizzle({ client, relations, schema }),
        ),
        socialPostPartRepository.claim(
          {
            ...DUE,
            id,
            leaseUntil: new Date("2030-01-01T00:20:00Z"),
            workspaceId,
          },
          drizzle({ client: other, relations, schema }),
        ),
      ])
      expect(results.filter((result) => result !== null)).toHaveLength(1)
    } finally {
      await other.end()
    }
  })

  test("a write that presents another lease changes nothing (the fence)", async () => {
    const { parts, targetId } = await targetWithParts(1)
    const db = database()
    const id = parts[0]?.id ?? ""
    await socialPostPartRepository.startFirst(
      { now: new Date(), socialPostTargetId: targetId, workspaceId },
      db,
    )
    await socialPostPartRepository.claim(
      { ...DUE, id, leaseUntil: LEASE, workspaceId },
      db,
    )

    const stale = new Date("2030-01-01T00:00:01Z")
    expect(
      await socialPostPartRepository.markStarted(
        { id, leaseUntil: stale, now: new Date(), workspaceId },
        db,
      ),
    ).toBe(false)
    expect(
      await socialPostPartRepository.settle(
        {
          fence: stale,
          id,
          outcome: {
            externalPostId: "x",
            kind: "published",
            permalink: null,
            publishedAt: new Date(),
          },
          workspaceId,
        },
        db,
      ),
    ).toBeNull()
    const [row] = (
      await client.query(
        `SELECT "status" FROM "SocialPostTargetPart" WHERE "id" = $1`,
        [id],
      )
    ).rows
    expect(row.status).toBe("publishing")
  })

  test("a needsReview part resumes first: retry resets it, resolve publishes it", async () => {
    const { parts, targetId } = await targetWithParts(2)
    const db = database()
    const [first, second] = parts
    await client.query(
      `UPDATE "SocialPostTargetPart" SET "status" = 'needsReview' WHERE "id" = $1`,
      [first?.id],
    )
    expect(
      (
        await socialPostPartRepository.firstUnsettled(
          { socialPostTargetId: targetId, workspaceId },
          db,
        )
      )?.id,
    ).toBe(first?.id)
    expect(
      await socialPostPartRepository.resolveAsPublished(
        { id: first?.id ?? "", now: new Date(), workspaceId },
        db,
      ),
    ).toBe(targetId)
    expect(
      (
        await socialPostPartRepository.firstUnsettled(
          { socialPostTargetId: targetId, workspaceId },
          db,
        )
      )?.id,
    ).toBe(second?.id)
  })

  test("deleting the target removes its parts", async () => {
    const { parts, targetId } = await targetWithParts(2)
    await client.query(`DELETE FROM "SocialPostTarget" WHERE "id" = $1`, [
      targetId,
    ])
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM "SocialPostTargetPart" WHERE "id" = ANY($1::bigint[])`,
      [parts.map((part) => part.id)],
    )
    expect(rows[0].n).toBe(0)
  })
})
