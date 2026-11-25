// @vitest-environment node

/**
 * The publishing pace against a real Postgres: really concurrent workers racing
 * for one destination's spacing slot (exactly one wins), the circuit breaker's
 * threshold, pause and reset, the rolling-24h read, and a claim given back
 * without spending an attempt. Commits for real, so every test deletes its
 * workspace afterwards.
 */

import { db, eq } from "@chatbotx.io/database/client"
import {
  socialPostPaceRepository,
  socialPostPublishRepository,
  socialPostRepository,
} from "@chatbotx.io/database/repositories"
import {
  publishDestinationModel,
  socialAccountDestinationModel,
  socialAccountModel,
  socialPostTargetModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { afterEach, describe, expect, test } from "vitest"

const realDatabaseUrl = (): string | null => {
  const url = process.env.DATABASE_URL
  if (!url) {
    return null
  }
  try {
    return new URL(url).port === "1" ? null : url
  } catch {
    return null
  }
}

const databaseUrl = realDatabaseUrl()
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

type Fixture = { destinationId: string; userId: string; workspaceId: string }

describe.skipIf(!databaseUrl)("publishing pace on a real database", () => {
  const created: Fixture[] = []

  const makeFixture = async (): Promise<Fixture> => {
    const suffix = `${Date.now()}-${Math.random()}`
    const [user] = await db
      .insert(userModel)
      .values({ email: `pace-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `pace-${suffix}`, ownerId: user.id })
      .returning({ id: workspaceModel.id })
    const [account] = await db
      .insert(socialAccountModel)
      .values({
        displayName: "acc",
        externalAccountId: `ext-${suffix}`,
        provider: "tiktok",
        workspaceId: workspace.id,
      })
      .returning({ id: socialAccountModel.id })
    const [accountDestination] = await db
      .insert(socialAccountDestinationModel)
      .values({
        externalId: `open-${suffix}`,
        kind: "profile",
        name: "creator",
        socialAccountId: account.id,
        workspaceId: workspace.id,
      })
      .returning({ id: socialAccountDestinationModel.id })
    const [destination] = await db
      .insert(publishDestinationModel)
      .values({
        provider: "tiktok",
        socialAccountDestinationId: accountDestination.id,
        workspaceId: workspace.id,
      })
      .returning({ id: publishDestinationModel.id })
    const fixture = {
      destinationId: destination.id,
      userId: user.id,
      workspaceId: workspace.id,
    }
    created.push(fixture)
    return fixture
  }

  afterEach(async () => {
    for (const { workspaceId, userId } of created.splice(0)) {
      await db
        .delete(socialPostTargetModel)
        .where(eq(socialPostTargetModel.workspaceId, workspaceId))
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, userId))
    }
  })

  test("ten workers racing for one destination: exactly one books the slot", async () => {
    const fixture = await makeFixture()
    const now = new Date()
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        socialPostPaceRepository.reservePublishSlot({
          destinationId: fixture.destinationId,
          gapMs: 15 * MINUTE_MS,
          now,
          workspaceId: fixture.workspaceId,
        }),
      ),
    )

    expect(results.filter(Boolean)).toHaveLength(1)
    const pace = await socialPostPaceRepository.findPace({
      destinationId: fixture.destinationId,
      workspaceId: fixture.workspaceId,
    })
    expect(pace?.lastPublishStartedAt?.getTime()).toBe(now.getTime())
  })

  test("after the gap the next worker books it; inside the gap it is refused", async () => {
    const fixture = await makeFixture()
    const input = {
      destinationId: fixture.destinationId,
      gapMs: 15 * MINUTE_MS,
      workspaceId: fixture.workspaceId,
    }
    const start = new Date()
    expect(
      await socialPostPaceRepository.reservePublishSlot({
        ...input,
        now: start,
      }),
    ).toBe(true)
    expect(
      await socialPostPaceRepository.reservePublishSlot({
        ...input,
        now: new Date(start.getTime() + 14 * MINUTE_MS),
      }),
    ).toBe(false)
    expect(
      await socialPostPaceRepository.reservePublishSlot({
        ...input,
        now: new Date(start.getTime() + 15 * MINUTE_MS),
      }),
    ).toBe(true)
  })

  test("another workspace's destination is never touched", async () => {
    const mine = await makeFixture()
    const other = await makeFixture()
    expect(
      await socialPostPaceRepository.reservePublishSlot({
        destinationId: mine.destinationId,
        gapMs: MINUTE_MS,
        now: new Date(),
        workspaceId: other.workspaceId,
      }),
    ).toBe(false)
  })

  test("the circuit breaker pauses at the second consecutive limit answer, and a publish resets it", async () => {
    const fixture = await makeFixture()
    const now = new Date()
    const input = {
      destinationId: fixture.destinationId,
      now,
      pauseMs: 6 * HOUR_MS,
      reason: "limitReached" as const,
      threshold: 2,
      workspaceId: fixture.workspaceId,
    }

    expect(await socialPostPaceRepository.recordLimitError(input)).toBeNull()
    const paused = await socialPostPaceRepository.recordLimitError(input)
    expect(paused).toEqual({
      pausedUntil: new Date(now.getTime() + 6 * HOUR_MS),
      reason: "limitReached",
    })
    expect(
      (
        await socialPostPaceRepository.findPace({
          destinationId: fixture.destinationId,
          workspaceId: fixture.workspaceId,
        })
      )?.pauseReason,
    ).toBe("limitReached")

    await socialPostPaceRepository.resetLimitErrors({
      destinationId: fixture.destinationId,
      workspaceId: fixture.workspaceId,
    })
    expect(
      await socialPostPaceRepository.findPace({
        destinationId: fixture.destinationId,
        workspaceId: fixture.workspaceId,
      }),
    ).toMatchObject({ pausedUntil: null, pauseReason: null })
    // The streak restarted: one answer again does not pause.
    expect(await socialPostPaceRepository.recordLimitError(input)).toBeNull()
  })

  test("limit, non-limit answer, limit does not pause; limit, limit pauses and restarts the streak", async () => {
    const fixture = await makeFixture()
    const now = new Date()
    const input = {
      destinationId: fixture.destinationId,
      now,
      pauseMs: 6 * HOUR_MS,
      reason: "limitReached" as const,
      threshold: 2,
      workspaceId: fixture.workspaceId,
    }
    const ids = {
      destinationId: fixture.destinationId,
      workspaceId: fixture.workspaceId,
    }

    expect(await socialPostPaceRepository.recordLimitError(input)).toBeNull()
    await socialPostPaceRepository.resetLimitStreak(ids)
    expect(await socialPostPaceRepository.recordLimitError(input)).toBeNull()

    expect(
      await socialPostPaceRepository.recordLimitError(input),
    ).not.toBeNull()
    // The pause restarted the streak: one answer after it ends does not re-pause.
    expect(await socialPostPaceRepository.recordLimitError(input)).toBeNull()
  })

  test("a claim given back by the pace gate spends no attempt", async () => {
    const fixture = await makeFixture()
    const postId = createId()
    const targetId = createId()
    await socialPostRepository.insertPost({
      createdById: null,
      createdVia: "api",
      id: postId,
      idempotencyKey: null,
      idempotencyRequestHash: null,
      linkUrl: null,
      text: "hello",
      workspaceId: fixture.workspaceId,
    })
    await socialPostRepository.insertTargets(
      [
        {
          contentType: "video",
          id: targetId,
          options: {},
          overridesMedia: false,
          provider: "tiktok",
          publishDestinationId: fixture.destinationId,
          scheduleMode: "custom",
          socialPostId: postId,
          textOverride: null,
          workspaceId: fixture.workspaceId,
        },
      ],
      db,
    )
    const now = new Date()
    await db
      .update(socialPostTargetModel)
      .set({ nextAttemptAt: now })
      .where(eq(socialPostTargetModel.id, targetId))
    const leaseUntil = new Date(now.getTime() + 10 * MINUTE_MS)
    const claim = await socialPostPublishRepository.claim({
      lateCutoff: new Date(0),
      id: targetId,
      leaseUntil,
      now,
      workspaceId: fixture.workspaceId,
    })
    expect(claim?.attemptCount).toBe(1)

    const until = new Date(now.getTime() + 20 * MINUTE_MS)
    expect(
      await socialPostPublishRepository.releaseClaim({
        fence: leaseUntil,
        id: targetId,
        nextAttemptAt: until,
        workspaceId: fixture.workspaceId,
      }),
    ).toBe(true)

    const [row] = await db
      .select()
      .from(socialPostTargetModel)
      .where(eq(socialPostTargetModel.id, targetId))
    expect(row).toMatchObject({
      attemptCount: 0,
      leaseExpiresAt: null,
      status: "pending",
    })
    expect(row?.nextAttemptAt?.getTime()).toBe(until.getTime())
    // A stale fence changes nothing.
    expect(
      await socialPostPublishRepository.releaseClaim({
        fence: leaseUntil,
        id: targetId,
        nextAttemptAt: until,
        workspaceId: fixture.workspaceId,
      }),
    ).toBe(false)
  })
})
