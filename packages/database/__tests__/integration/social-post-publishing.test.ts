// @vitest-environment node

/**
 * The publishing pipeline's writes against a real database: a claim is taken by
 * one worker only, every later write presents the claim's lease, the scans take
 * due and expired targets without overlap, and their predicates use the partial
 * indexes.
 *
 * Runs only against an explicitly configured local database:
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { relations } from "../../src/relations"
import { socialPostPublishRepository as repo } from "../../src/repositories/social-post/publishing"
import { socialPostRepository } from "../../src/repositories/social-post/repository"
import { socialPostSchedulingRepository } from "../../src/repositories/social-post/scheduling"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"
import { insertPublishDestination } from "./publish-destination-fixture"

const databaseUrl = realDatabaseUrl()
const MINUTE = 60_000

describe.skipIf(!databaseUrl)("publishing against a real database", () => {
  let client: Client
  let workspaceId: string
  let userId: string
  let destinationId: string
  let sequence = 0
  const nextId = () => `${Date.now()}${String(++sequence).padStart(6, "0")}`
  const database = () => drizzle({ client, relations, schema })

  /** A post with one pending target, optionally already due. */
  const dueTarget = async (
    nextAttemptAt: Date | null = new Date(Date.now() - MINUTE),
  ) => {
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
    await client.query(
      `INSERT INTO "SocialPostTarget" ("id","socialPostId","workspaceId","publishDestinationId","provider","contentType","nextAttemptAt")
       VALUES ($1,$2,$3,$4,'facebook','text',$5)`,
      [targetId, postId, workspaceId, destinationId, nextAttemptAt],
    )
    return { postId, targetId }
  }

  /** Stamps the destination as the pace gate does when it reserves a slot. */
  const reserveDestination = async (reservedAt: Date) => {
    await client.query(
      `UPDATE "PublishDestination" SET "lastPublishStartedAt" = $2 WHERE id = $1`,
      [destinationId, reservedAt],
    )
  }

  const row = async (id: string) =>
    (await client.query(`SELECT * FROM "SocialPostTarget" WHERE id = $1`, [id]))
      .rows[0]

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl as string })
    await client.connect()
    const db = database()
    const suffix = `${Date.now()}-${Math.random()}`
    const [user] = await db
      .insert(schema.userModel)
      .values({ email: `pub-${suffix}@example.test` })
      .returning({ id: schema.userModel.id })
    userId = user.id
    const [workspace] = await db
      .insert(schema.workspaceModel)
      .values({ name: `pub-${suffix}`, ownerId: user.id })
      .returning({ id: schema.workspaceModel.id })
    workspaceId = workspace.id
    const destination = {
      id: await insertPublishDestination(db, {
        label: "pub",
        workspaceId,
      }),
    }
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

  test("two workers claiming one target: exactly one wins", async () => {
    const { targetId } = await dueTarget()
    const now = new Date()
    const claim = (offset: number) =>
      repo.claim({
        lateCutoff: new Date(0),
        id: targetId,
        leaseUntil: new Date(now.getTime() + offset),
        now,
        workspaceId,
      })

    const results = await Promise.all([claim(MINUTE), claim(2 * MINUTE)])

    expect(results.filter(Boolean)).toHaveLength(1)
    const stored = await row(targetId)
    expect(stored.status).toBe("publishing")
    expect(stored.attemptCount).toBe(1)
    expect(stored.publishStartedAt).toBeNull()
  })

  test("a draft target (no nextAttemptAt) is never claimed", async () => {
    const { targetId } = await dueTarget(null)
    const claimed = await repo.claim({
      lateCutoff: new Date(0),
      id: targetId,
      leaseUntil: new Date(Date.now() + MINUTE),
      now: new Date(),
      workspaceId,
    })
    expect(claimed).toBeNull()
  })

  test("a queued job does not claim a target rescheduled to the future", async () => {
    const { targetId } = await dueTarget()
    await client.query(
      `UPDATE "SocialPostTarget" SET "nextAttemptAt" = $2 WHERE id = $1`,
      [targetId, new Date(Date.now() + 24 * 60 * MINUTE)],
    )
    const claimed = await repo.claim({
      lateCutoff: new Date(0),
      id: targetId,
      leaseUntil: new Date(Date.now() + MINUTE),
      now: new Date(),
      workspaceId,
    })
    expect(claimed).toBeNull()
    expect((await row(targetId)).status).toBe("pending")
  })

  test("a target the scan queued is claimable; one rescheduled past the window is refused", async () => {
    const pushBack = 5 * MINUTE
    const queued = await dueTarget(new Date(Date.now() - MINUTE))
    const rescheduled = await dueTarget(new Date(Date.now() - MINUTE))
    const now = new Date()
    await repo.claimDue({
      lateCutoff: new Date(0),
      limit: 1000,
      now,
      pushBackUntil: new Date(now.getTime() + pushBack),
    })
    await client.query(
      `UPDATE "SocialPostTarget" SET "nextAttemptAt" = $2 WHERE id = $1`,
      [rescheduled.targetId, new Date(Date.now() + 24 * 60 * MINUTE)],
    )
    const attempt = (id: string) =>
      repo.claim({
        lateCutoff: new Date(0),
        id,
        leaseUntil: new Date(Date.now() + MINUTE),
        now: new Date(),
        workspaceId,
      })

    expect(await attempt(queued.targetId)).not.toBeNull()
    expect((await row(queued.targetId)).status).toBe("publishing")
    expect(await attempt(rescheduled.targetId)).toBeNull()
    expect((await row(rescheduled.targetId)).status).toBe("pending")
  })

  test("a write that presents a stale lease changes nothing", async () => {
    const { targetId } = await dueTarget()
    const lease = new Date(Date.now() + MINUTE)
    await repo.claim({
      lateCutoff: new Date(0),
      id: targetId,
      leaseUntil: lease,
      now: new Date(),
      workspaceId,
    })

    const stale = new Date(lease.getTime() - 1000)
    expect(
      await repo.markAttemptStarted({
        id: targetId,
        leaseUntil: stale,
        now: new Date(),
        workspaceId,
      }),
    ).toBe("leaseLost")
    expect(
      await repo.settle({
        fence: stale,
        id: targetId,
        outcome: {
          externalPostId: "x",
          kind: "published",
          permalink: null,
          publishedAt: new Date(),
        },
        workspaceId,
      }),
    ).toBeNull()
    expect((await row(targetId)).status).toBe("publishing")

    expect(
      await repo.markAttemptStarted({
        id: targetId,
        leaseUntil: lease,
        now: new Date(),
        workspaceId,
      }),
    ).toBe("marked")
    expect(
      await repo.settle({
        fence: lease,
        id: targetId,
        outcome: {
          externalPostId: "x",
          kind: "published",
          permalink: null,
          publishedAt: new Date(),
        },
        workspaceId,
      }),
    ).not.toBeNull()
    const done = await row(targetId)
    expect(done.status).toBe("published")
    expect(done.externalPostId).toBe("x")
    expect(done.leaseExpiresAt).toBeNull()
  })

  test("a retry outcome returns the target to pending and clears the marker", async () => {
    const { targetId } = await dueTarget()
    const lease = new Date(Date.now() + MINUTE)
    await repo.claim({
      lateCutoff: new Date(0),
      id: targetId,
      leaseUntil: lease,
      now: new Date(),
      workspaceId,
    })
    await repo.markAttemptStarted({
      id: targetId,
      leaseUntil: lease,
      now: new Date(),
      workspaceId,
    })

    await repo.settle({
      fence: lease,
      id: targetId,
      outcome: {
        error: { category: "rateLimited", code: "429", message: "slow down" },
        kind: "retry",
        nextAttemptAt: new Date(Date.now() + 5 * MINUTE),
      },
      workspaceId,
    })

    const stored = await row(targetId)
    expect(stored.status).toBe("pending")
    expect(stored.publishStartedAt).toBeNull()
    expect(stored.errorCategory).toBe("rateLimited")
    expect(stored.attemptCount).toBe(1)
  })

  test("the due scan takes each target once and pushes it ahead", async () => {
    const { targetId } = await dueTarget(new Date(Date.now() - 10 * MINUTE))
    const now = new Date()
    const scan = () =>
      repo.claimDue({
        lateCutoff: new Date(0),
        limit: 1000,
        now,
        pushBackUntil: new Date(now.getTime() + 5 * MINUTE),
      })

    const [a, b] = await Promise.all([scan(), scan()])
    const ids = [...a, ...b].map((target) => target.id)

    expect(ids.filter((id) => id === targetId)).toHaveLength(1)
    expect((await row(targetId)).status).toBe("pending")
    expect((await scan()).map((target) => target.id)).not.toContain(targetId)
  })

  test("the scan and the claim leave a target older than the late cutoff to the missed sweep", async () => {
    const stale = await dueTarget(new Date(Date.now() - 7 * 60 * MINUTE))
    const fresh = await dueTarget(new Date(Date.now() - MINUTE))
    const now = new Date()
    const lateCutoff = new Date(now.getTime() - 6 * 60 * MINUTE)

    const due = (
      await repo.claimDue({
        lateCutoff,
        limit: 1000,
        now,
        pushBackUntil: new Date(now.getTime() + 5 * MINUTE),
      })
    ).map((target) => target.id)
    const claimStale = await repo.claim({
      id: stale.targetId,
      lateCutoff,
      leaseUntil: new Date(now.getTime() + MINUTE),
      now,
      workspaceId,
    })

    expect(due).toContain(fresh.targetId)
    expect(due).not.toContain(stale.targetId)
    expect(claimStale).toBeNull()
    expect((await row(stale.targetId)).status).toBe("pending")
  })

  test("repeated scans of a dropped job never move the clock the missed sweep measures", async () => {
    const planned = new Date(Date.now() - 7 * 60 * MINUTE)
    const { targetId } = await dueTarget(planned)
    for (let tick = 0; tick < 3; tick += 1) {
      const now = new Date(Date.now() + tick * 6 * MINUTE)
      await repo.claimDue({
        lateCutoff: new Date(0),
        limit: 1000,
        now,
        pushBackUntil: new Date(now.getTime() + 5 * MINUTE),
      })
    }

    const stored = await row(targetId)
    expect(stored.nextAttemptAt).toEqual(planned)
    const missed = await socialPostSchedulingRepository.listMissed({
      cutoff: new Date(Date.now() - 6 * 60 * MINUTE),
      limit: 1000,
    })
    expect(missed.map((item) => item.id)).toContain(targetId)
  })

  test("the expired-lease scan takes a target once and gives it a new lease", async () => {
    const { targetId } = await dueTarget()
    const past = new Date(Date.now() - 5 * MINUTE)
    await repo.claim({
      lateCutoff: new Date(0),
      id: targetId,
      leaseUntil: past,
      now: new Date(),
      workspaceId,
    })
    const now = new Date()
    const scan = () =>
      repo.claimExpired({
        leaseUntil: new Date(now.getTime() + 10 * MINUTE),
        limit: 1000,
        now,
      })

    const [a, b] = await Promise.all([scan(), scan()])
    const taken = [...a, ...b].filter((target) => target.id === targetId)

    expect(taken).toHaveLength(1)
    expect(taken[0]?.status).toBe("publishing")
    expect(taken[0]?.publishStartedAt).toBeNull()
  })

  describe("the delayed check's compare-and-set claim", () => {
    /** A target settled as `processing` whose lease is its next check time. */
    const processingDueAt = async (due: Date) => {
      const { targetId } = await dueTarget()
      await client.query(
        `UPDATE "SocialPostTarget" SET "status" = 'processing', "leaseExpiresAt" = $2 WHERE id = $1`,
        [targetId, due],
      )
      return targetId
    }
    const claimDue = (
      id: string,
      expectedDueAt: Date,
      leaseUntil: Date,
      workspace: string = workspaceId,
    ) =>
      repo.claimExpired({
        leaseUntil,
        limit: 1,
        now: new Date(),
        only: { expectedDueAt, id, workspaceId: workspace },
      })

    test("swaps the stored check time for a recovery lease, once, even when the check time is still ahead", async () => {
      const due = new Date(Date.now() + 20_000)
      const targetId = await processingDueAt(due)
      const lease = new Date(Date.now() + 10 * MINUTE)

      const [first] = await claimDue(targetId, due, lease)
      const second = await claimDue(
        targetId,
        due,
        new Date(lease.getTime() + 1),
      )

      expect(first?.id).toBe(targetId)
      expect(first?.leaseUntil).toEqual(lease)
      expect(second).toEqual([])
      expect((await row(targetId)).leaseExpiresAt).toEqual(lease)
    })

    test("two claimers racing on one check time: exactly one wins", async () => {
      const due = new Date(Date.now() - 1000)
      const targetId = await processingDueAt(due)
      const base = Date.now() + 10 * MINUTE

      const results = await Promise.all([
        claimDue(targetId, due, new Date(base)),
        claimDue(targetId, due, new Date(base + 1000)),
      ])

      expect(results.flat()).toHaveLength(1)
    })

    test("the minute scan winning first leaves a stale delayed job without a claim", async () => {
      const due = new Date(Date.now() - 1000)
      const targetId = await processingDueAt(due)
      const now = new Date()
      const scanLease = new Date(now.getTime() + 10 * MINUTE)
      const scanned = await repo.claimExpired({
        leaseUntil: scanLease,
        limit: 1000,
        now,
      })
      expect(scanned.map((target) => target.id)).toContain(targetId)

      const late = await claimDue(
        targetId,
        due,
        new Date(Date.now() + 20 * MINUTE),
      )

      expect(late).toEqual([])
      expect((await row(targetId)).leaseExpiresAt).toEqual(scanLease)
    })

    test("a different check time, another workspace or a settled target is never claimed", async () => {
      const due = new Date(Date.now() - 1000)
      const targetId = await processingDueAt(due)
      const lease = new Date(Date.now() + 10 * MINUTE)

      expect(
        await claimDue(targetId, new Date(due.getTime() + 1), lease),
      ).toEqual([])
      expect(await claimDue(targetId, due, lease, "1")).toEqual([])
      await client.query(
        `UPDATE "SocialPostTarget" SET "status" = 'published' WHERE id = $1`,
        [targetId],
      )
      expect(await claimDue(targetId, due, lease)).toEqual([])
    })
  })

  test("resetForRetry only takes failed or unconfirmed targets", async () => {
    const { targetId } = await dueTarget()
    const database0 = database() as never
    expect(
      await repo.resetForRetry(
        { id: targetId, now: new Date(), workspaceId },
        database0,
      ),
    ).toBeNull()
    await client.query(
      `UPDATE "SocialPostTarget" SET "status" = 'needsReview', "attemptCount" = 3 WHERE id = $1`,
      [targetId],
    )
    expect(
      await repo.resetForRetry(
        { id: targetId, now: new Date(), workspaceId },
        database0,
      ),
    ).not.toBeNull()
    const stored = await row(targetId)
    expect(stored.status).toBe("pending")
    expect(stored.attemptCount).toBe(0)
  })

  test("the scanners' predicates use their partial indexes", async () => {
    await client.query("SET enable_seqscan = off")
    try {
      const plan = async (sql: string) =>
        (await client.query(`EXPLAIN ${sql}`)).rows
          .map((r) => r["QUERY PLAN"])
          .join("\n")
      expect(
        await plan(
          `SELECT id FROM "SocialPostTarget" WHERE status = 'pending' AND "nextAttemptAt" <= now() ORDER BY "nextAttemptAt", id LIMIT 100`,
        ),
      ).toContain("SocialPostTarget_due_idx")
      expect(
        await plan(
          `SELECT id FROM "SocialPostTarget" WHERE status IN ('publishing','processing') AND "leaseExpiresAt" < now() ORDER BY "leaseExpiresAt", id LIMIT 25`,
        ),
      ).toContain("SocialPostTarget_lease_idx")
    } finally {
      await client.query("RESET enable_seqscan")
    }
  })

  describe("the message quota charge", () => {
    const claimed = async () => {
      const { targetId } = await dueTarget()
      const fence = new Date(Date.now() + 10 * MINUTE)
      await repo.claim({
        lateCutoff: new Date(0),
        id: targetId,
        leaseUntil: fence,
        now: new Date(),
        workspaceId,
      })
      return { fence, targetId }
    }
    const published = {
      externalPostId: "x",
      kind: "published" as const,
      permalink: null,
      publishedAt: new Date(),
    }

    test("a published settle owes one charge in the same write; claiming it is won once", async () => {
      const { fence, targetId } = await claimed()
      await repo.settle({
        fence,
        id: targetId,
        outcome: published,
        workspaceId,
      })
      expect((await row(targetId)).quotaChargePending).toBe(true)

      const wins = await Promise.all([
        repo.claimQuotaCharge({ id: targetId, workspaceId }),
        repo.claimQuotaCharge({ id: targetId, workspaceId }),
      ])

      expect(wins.filter(Boolean)).toHaveLength(1)
      const stored = await row(targetId)
      expect(stored.quotaChargePending).toBe(false)
      expect(stored.quotaChargedAt).not.toBeNull()
    })

    test("a released charge is owed again and listed oldest first; a charged target never owes twice", async () => {
      const { fence, targetId } = await claimed()
      await repo.settle({
        fence,
        id: targetId,
        outcome: published,
        workspaceId,
      })
      await repo.claimQuotaCharge({ id: targetId, workspaceId })
      expect(await repo.releaseQuotaCharge({ id: targetId, workspaceId })).toBe(
        true,
      )

      const pending = await repo.listPendingQuotaCharges({ limit: 1000 })
      expect(pending.map((p) => p.id)).toContain(targetId)
      const ids = pending.map((p) => BigInt(p.id))
      expect(ids).toEqual([...ids].sort((a, b) => (a < b ? -1 : 1)))

      await repo.claimQuotaCharge({ id: targetId, workspaceId })
      await client.query(
        `UPDATE "SocialPostTarget" SET status = 'processing' WHERE id = $1`,
        [targetId],
      )
      await repo.finishFromPart(
        { error: null, id: targetId, outcome: "published", workspaceId },
        database() as never,
      )
      expect((await row(targetId)).quotaChargePending).toBe(false)
    })

    test("failed, needsReview, headPublished and a person's resolve behave as designed", async () => {
      const failed = await claimed()
      await repo.settle({
        fence: failed.fence,
        id: failed.targetId,
        outcome: {
          error: { category: "unknown", code: "x", message: "m" },
          kind: "failed",
        },
        workspaceId,
      })
      const head = await claimed()
      await repo.settle({
        fence: head.fence,
        id: head.targetId,
        outcome: { ...published, kind: "headPublished" },
        workspaceId,
      })
      const review = await claimed()
      await repo.settle({
        fence: review.fence,
        id: review.targetId,
        outcome: {
          error: { category: "unknown", code: "x", message: "m" },
          kind: "needsReview",
        },
        workspaceId,
      })

      for (const id of [failed.targetId, head.targetId, review.targetId]) {
        expect((await row(id)).quotaChargePending).toBe(false)
      }

      await repo.resolveAsPublished(
        { id: review.targetId, now: new Date(), workspaceId },
        database() as never,
      )
      expect((await row(review.targetId)).quotaChargePending).toBe(true)
    })

    test("a quota failure gives the claim's attempt back and sets no marker", async () => {
      const { fence, targetId } = await claimed()
      expect((await row(targetId)).attemptCount).toBe(1)

      await repo.settle({
        fence,
        id: targetId,
        outcome: {
          error: {
            category: "quotaExceeded",
            code: "postMessageQuotaExceeded",
            message: "m",
          },
          giveAttemptBack: true,
          kind: "failed",
        },
        workspaceId,
      })

      const stored = await row(targetId)
      expect(stored.status).toBe("failed")
      expect(stored.attemptCount).toBe(0)
      expect(stored.publishStartedAt).toBeNull()
      expect(stored.errorCode).toBe("postMessageQuotaExceeded")
      expect(stored.quotaChargePending).toBe(false)
    })
  })
  describe("the fenced attempt marker", () => {
    test("the marker stores no continuation: a direct publish leaves no provider-side identity", async () => {
      const { targetId } = await dueTarget()
      const lease = new Date(Date.now() + MINUTE)
      const reservedAt = new Date(Date.now() - 1000)
      await reserveDestination(reservedAt)
      await repo.claim({
        lateCutoff: new Date(0),
        id: targetId,
        leaseUntil: lease,
        now: new Date(),
        workspaceId,
      })
      expect(
        await repo.markAttemptStarted({
          id: targetId,
          leaseUntil: lease,
          now: new Date(),
          reservedAt,
          workspaceId,
        }),
      ).toBe("marked")

      const stored = await row(targetId)
      expect(stored.continuation).toBeNull()
      expect(stored.publishStartedAt).not.toBeNull()
    })

    test("the marker is refused when a newer attempt replaced the destination reservation, accepted when it still matches", async () => {
      const { targetId } = await dueTarget()
      const lease = new Date(Date.now() + MINUTE)
      const older = new Date(Date.now() - 5000)
      const newer = new Date(Date.now() - 1000)
      await repo.claim({
        lateCutoff: new Date(0),
        id: targetId,
        leaseUntil: lease,
        now: new Date(),
        workspaceId,
      })
      await reserveDestination(newer)
      const mark = (reservedAt: Date) =>
        repo.markAttemptStarted({
          id: targetId,
          leaseUntil: lease,
          now: new Date(),
          reservedAt,
          workspaceId,
        })

      expect(await mark(older)).toBe("reservationTaken")
      const refused = await row(targetId)
      expect(refused.publishStartedAt).toBeNull()
      expect(refused.continuation).toBeNull()

      expect(await mark(newer)).toBe("marked")
      expect((await row(targetId)).publishStartedAt).not.toBeNull()
    })

    test("a stale lease with a matching reservation is reported as a lost lease", async () => {
      const { targetId } = await dueTarget()
      const lease = new Date(Date.now() + MINUTE)
      const reservedAt = new Date(Date.now() - 1000)
      await repo.claim({
        lateCutoff: new Date(0),
        id: targetId,
        leaseUntil: lease,
        now: new Date(),
        workspaceId,
      })
      await reserveDestination(reservedAt)

      expect(
        await repo.markAttemptStarted({
          id: targetId,
          leaseUntil: new Date(lease.getTime() - 1000),
          now: new Date(),
          reservedAt,
          workspaceId,
        }),
      ).toBe("leaseLost")
    })
  })
})
