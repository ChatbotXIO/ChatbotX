// @vitest-environment node

/**
 * Scheduling, the posting-slot queue and the missed-schedule policy against a
 * real Postgres: really concurrent add-to-queue calls, the all-or-nothing
 * reflow, the conditional reschedule, slot release on a final state, the
 * partial unique index and its EXPLAIN, and the cascade of the schedule row.
 *
 * Commits for real, so every test deletes its workspace afterwards.
 */

import { db, eq, sql } from "@chatbotx.io/database/client"
import {
  socialPostPublishRepository,
  socialPostRepository,
  socialPostSchedulingRepository,
} from "@chatbotx.io/database/repositories"
import {
  inboxModel,
  publishDestinationModel,
  publishDestinationScheduleModel,
  socialPostTargetModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { emptyPostingSlots } from "@chatbotx.io/utils/posting-slots"
import { afterEach, describe, expect, test, vi } from "vitest"

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

vi.mock("@chatbotx.io/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/redis")>()),
  withCache: (_key: string, fn: () => Promise<unknown>) => fn(),
  invalidateCacheByTags: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../../src/platform/settings", () => ({
  resolveTenantSettings: async () => ({ storageUrl: "https://files.test" }),
}))

const { socialPostScheduleService } = await import(
  "../../src/social-post/schedule.service"
)
const { socialPostingScheduleService } = await import(
  "../../src/social-post/posting-schedule.service"
)
const { socialPostService } = await import("../../src/social-post/service")
const { cancelScheduledPost } = await import("../../src/social-post/cancel")

const databaseUrl = realDatabaseUrl()
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

type Fixture = {
  destinationId: string
  secondDestinationId: string
  userId: string
  workspaceId: string
}

const everyDay = (times: string[]) =>
  emptyPostingSlots().map((day) => ({ ...day, enabled: true, times }))

describe.skipIf(!databaseUrl)("post scheduling on a real database", () => {
  const created: Fixture[] = []

  const makeFixture = async (): Promise<Fixture> => {
    const suffix = `${Date.now()}-${Math.random()}`
    const [user] = await db
      .insert(userModel)
      .values({ email: `sched-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `sched-${suffix}`, ownerId: user.id })
      .returning({ id: workspaceModel.id })
    const inboxes = await db
      .insert(inboxModel)
      .values(
        ["one", "two"].map((label) => ({
          channel: "messenger",
          name: label,
          sourceId: `page-${label}-${suffix}`,
          workspaceId: workspace.id,
        })),
      )
      .returning({ id: inboxModel.id })
    const bindings = await db
      .insert(publishDestinationModel)
      .values(
        inboxes.map((inbox) => ({
          inboxId: inbox.id,
          provider: "facebook" as const,
          workspaceId: workspace.id,
        })),
      )
      .returning({ id: publishDestinationModel.id })
    const fixture = {
      destinationId: bindings[0].id,
      secondDestinationId: bindings[1].id,
      userId: user.id,
      workspaceId: workspace.id,
    }
    created.push(fixture)
    return fixture
  }

  afterEach(async () => {
    vi.restoreAllMocks()
    for (const { workspaceId, userId } of created.splice(0)) {
      await db
        .delete(socialPostTargetModel)
        .where(eq(socialPostTargetModel.workspaceId, workspaceId))
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, userId))
    }
  })

  const draft = async (
    fixture: Fixture,
    destinationId = fixture.destinationId,
  ): Promise<{ postId: string; targetId: string }> => {
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
          contentType: "text",
          id: targetId,
          options: {},
          overridesMedia: false,
          provider: "facebook",
          scheduleMode: "custom",
          publishDestinationId: destinationId,
          socialPostId: postId,
          textOverride: null,
          workspaceId: fixture.workspaceId,
        },
      ],
      db,
    )
    return { postId, targetId }
  }

  const setSchedule = async (
    fixture: Fixture,
    times: string[],
    timezone = "UTC",
  ) =>
    await socialPostingScheduleService.update({
      destinationId: fixture.destinationId,
      slots: everyDay(times),
      timezone,
      workspaceId: fixture.workspaceId,
    })

  const targetRow = async (id: string) => {
    const [row] = await db
      .select()
      .from(socialPostTargetModel)
      .where(eq(socialPostTargetModel.id, id))
    return row
  }

  const queueNext = async (fixture: Fixture, postId: string) =>
    await socialPostScheduleService.schedule({
      id: postId,
      plan: { queue: "next" },
      workspaceId: fixture.workspaceId,
    })

  test("two concurrent add-to-queue calls get different slots and never double-book", async () => {
    const fixture = await makeFixture()
    await setSchedule(fixture, ["09:00", "18:00"])
    const posts = await Promise.all(
      Array.from({ length: 4 }, () => draft(fixture)),
    )
    await Promise.all(posts.map((p) => queueNext(fixture, p.postId)))
    const rows = await Promise.all(posts.map((p) => targetRow(p.targetId)))
    const slots = rows.map((row) => row.queueSlotAt?.getTime())
    expect(slots.every((s) => s !== undefined)).toBe(true)
    expect(new Set(slots).size).toBe(4)
    for (const row of rows) {
      expect(row.scheduleMode).toBe("queue")
      expect(row.nextAttemptAt?.getTime()).toBe(row.scheduledAt?.getTime())
      expect(row.scheduledAt?.getTime()).toBe(row.queueSlotAt?.getTime())
    }
  })

  test("the unique index rejects a second target on the same slot, and a final state frees it", async () => {
    const fixture = await makeFixture()
    const [a, b] = [await draft(fixture), await draft(fixture)]
    const slot = new Date(Date.now() + 3 * HOUR_MS)
    slot.setSeconds(0, 0)
    await db
      .update(socialPostTargetModel)
      .set({ queueSlotAt: slot })
      .where(eq(socialPostTargetModel.id, a.targetId))
    await expect(
      db
        .update(socialPostTargetModel)
        .set({ queueSlotAt: slot })
        .where(eq(socialPostTargetModel.id, b.targetId)),
    ).rejects.toThrow()

    const lease = new Date(Date.now() + HOUR_MS)
    await db
      .update(socialPostTargetModel)
      .set({ leaseExpiresAt: lease, status: "publishing" })
      .where(eq(socialPostTargetModel.id, a.targetId))
    await socialPostPublishRepository.settle({
      fence: lease,
      id: a.targetId,
      outcome: {
        externalPostId: "x",
        kind: "published",
        permalink: null,
        publishedAt: new Date(),
      },
      workspaceId: fixture.workspaceId,
    })
    expect((await targetRow(a.targetId)).queueSlotAt).toBeNull()
    await db
      .update(socialPostTargetModel)
      .set({ queueSlotAt: slot })
      .where(eq(socialPostTargetModel.id, b.targetId))
  })

  test("queue top takes the first slot and pushes the queued posts one slot later", async () => {
    const fixture = await makeFixture()
    await setSchedule(fixture, ["09:00", "18:00"])
    const [first, second, third] = [
      await draft(fixture),
      await draft(fixture),
      await draft(fixture),
    ]
    await queueNext(fixture, first.postId)
    await queueNext(fixture, second.postId)
    const before = [
      (await targetRow(first.targetId)).queueSlotAt,
      (await targetRow(second.targetId)).queueSlotAt,
    ]
    await socialPostScheduleService.schedule({
      id: third.postId,
      plan: { queue: "top" },
      workspaceId: fixture.workspaceId,
    })
    const after = await Promise.all(
      [third, first, second].map(
        async (p) => (await targetRow(p.targetId)).queueSlotAt,
      ),
    )
    expect(after[0]?.getTime()).toBe(before[0]?.getTime())
    expect(after[1]?.getTime()).toBe(before[1]?.getTime())
    expect(after[2]?.getTime()).toBeGreaterThan(before[1]?.getTime() ?? 0)
  })

  test("editing the schedule keeps a surviving slot, moves a removed one, and reports it", async () => {
    const fixture = await makeFixture()
    await setSchedule(fixture, ["09:00", "18:00"])
    const posts = [await draft(fixture), await draft(fixture)]
    for (const p of posts) {
      await queueNext(fixture, p.postId)
    }
    const before = await Promise.all(posts.map((p) => targetRow(p.targetId)))
    // Drop the 09:00 time: slots at 09:00 must move, slots at 18:00 stay.
    const result = await setSchedule(fixture, ["18:00"])
    const after = await Promise.all(posts.map((p) => targetRow(p.targetId)))
    const lost = before.filter((row) => row.queueSlotAt?.getUTCHours() === 9)
    expect(result.reflow.moved.length).toBe(lost.length)
    for (const row of after) {
      expect(row.queueSlotAt?.getUTCHours()).toBe(18)
      expect(row.scheduleMode).toBe("queue")
    }
    expect(new Set(after.map((r) => r.queueSlotAt?.getTime())).size).toBe(2)
  })

  test("a schedule with no time left detaches the queue to custom times and reports it", async () => {
    const fixture = await makeFixture()
    await setSchedule(fixture, ["18:00"])
    const post = await draft(fixture)
    await queueNext(fixture, post.postId)
    const before = await targetRow(post.targetId)
    const result = await socialPostingScheduleService.update({
      destinationId: fixture.destinationId,
      slots: emptyPostingSlots(),
      workspaceId: fixture.workspaceId,
    })
    const after = await targetRow(post.targetId)
    expect(result.reflow.detached).toEqual([
      { scheduledAt: before.queueSlotAt, targetId: post.targetId },
    ])
    expect(after.scheduleMode).toBe("custom")
    expect(after.queueSlotAt).toBeNull()
    expect(after.scheduledAt?.getTime()).toBe(before.scheduledAt?.getTime())
    expect(after.nextAttemptAt?.getTime()).toBe(before.nextAttemptAt?.getTime())
  })

  test("a failure in the middle of a reflow leaves the schedule and every target as they were", async () => {
    const fixture = await makeFixture()
    await setSchedule(fixture, ["09:00", "18:00"])
    const posts = [await draft(fixture), await draft(fixture)]
    for (const p of posts) {
      await queueNext(fixture, p.postId)
    }
    const before = await Promise.all(posts.map((p) => targetRow(p.targetId)))
    const original = socialPostSchedulingRepository.setTargetSchedule
    let calls = 0
    vi.spyOn(
      socialPostSchedulingRepository,
      "setTargetSchedule",
    ).mockImplementation(async (input, tx) => {
      calls += 1
      return calls === 2 ? false : await original(input, tx)
    })
    await expect(setSchedule(fixture, ["03:00"])).rejects.toThrow()
    vi.restoreAllMocks()
    const after = await Promise.all(posts.map((p) => targetRow(p.targetId)))
    expect(after.map((r) => r.queueSlotAt?.getTime())).toEqual(
      before.map((r) => r.queueSlotAt?.getTime()),
    )
    const stored = await socialPostSchedulingRepository.findPostingSchedule({
      destinationId: fixture.destinationId,
      workspaceId: fixture.workspaceId,
    })
    expect(stored?.slots[0]?.times).toEqual(["09:00", "18:00"])
  })

  test("changing the zone keeps each queued post on the same local time", async () => {
    const fixture = await makeFixture()
    await setSchedule(fixture, ["09:00"], "UTC")
    const post = await draft(fixture)
    await queueNext(fixture, post.postId)
    await setSchedule(fixture, ["09:00"], "Asia/Ho_Chi_Minh")
    const after = await targetRow(post.targetId)
    expect(after.timezone).toBe("Asia/Ho_Chi_Minh")
    // 09:00 at UTC+7 is 02:00Z.
    expect(after.queueSlotAt?.getUTCHours()).toBe(2)
  })

  test("reschedule is conditional: a target due within a minute, or already tried, refuses the whole call", async () => {
    const fixture = await makeFixture()
    const post = await draft(fixture)
    const at = new Date(Date.now() + 3 * HOUR_MS)
    await socialPostScheduleService.schedule({
      id: post.postId,
      plan: { scheduledAt: at },
      workspaceId: fixture.workspaceId,
    })
    expect((await targetRow(post.targetId)).status).toBe("pending")
    const moved = await socialPostScheduleService.reschedule({
      change: { kind: "at", scheduledAt: new Date(at.getTime() + HOUR_MS) },
      id: post.postId,
      workspaceId: fixture.workspaceId,
    })
    expect(moved.status).toBe("scheduled")

    await db
      .update(socialPostTargetModel)
      .set({ nextAttemptAt: new Date(Date.now() + 30_000) })
      .where(eq(socialPostTargetModel.id, post.targetId))
    await expect(
      socialPostScheduleService.reschedule({
        change: { kind: "unschedule" },
        id: post.postId,
        workspaceId: fixture.workspaceId,
      }),
    ).rejects.toMatchObject({ code: "socialPostTargetNotReschedulable" })
  })

  test("unschedule returns the post to a draft and clears both clocks and the slot", async () => {
    const fixture = await makeFixture()
    await setSchedule(fixture, ["09:00"])
    const post = await draft(fixture)
    await queueNext(fixture, post.postId)
    const result = await socialPostScheduleService.reschedule({
      change: { kind: "unschedule" },
      id: post.postId,
      workspaceId: fixture.workspaceId,
    })
    const row = await targetRow(post.targetId)
    expect(result.status).toBe("draft")
    expect([row.scheduledAt, row.nextAttemptAt, row.queueSlotAt]).toEqual([
      null,
      null,
      null,
    ])
    expect(row.scheduleMode).toBe("custom")
  })

  test("cancelling a scheduled post cancels its targets and frees the slot", async () => {
    const fixture = await makeFixture()
    await setSchedule(fixture, ["09:00"])
    const post = await draft(fixture)
    await queueNext(fixture, post.postId)
    expect(
      await cancelScheduledPost({
        id: post.postId,
        workspaceId: fixture.workspaceId,
      }),
    ).toBe(true)
    const row = await targetRow(post.targetId)
    expect(row.status).toBe("cancelled")
    expect(row.queueSlotAt).toBeNull()
    const stored = await socialPostRepository.findForWorkspace({
      id: post.postId,
      workspaceId: fixture.workspaceId,
    })
    expect(stored?.status).toBe("cancelled")
    expect(
      await cancelScheduledPost({
        id: post.postId,
        workspaceId: fixture.workspaceId,
      }),
    ).toBe(false)
  })

  test("a target late by up to six hours still publishes; later it fails as missedSchedule", async () => {
    const fixture = await makeFixture()
    const late = await draft(fixture)
    const veryLate = await draft(fixture)
    const now = Date.now()
    for (const [p, ago] of [
      [late, 1 * HOUR_MS],
      [veryLate, 7 * HOUR_MS],
    ] as const) {
      await db
        .update(socialPostTargetModel)
        .set({
          nextAttemptAt: new Date(now - ago),
          scheduledAt: new Date(now - ago),
        })
        .where(eq(socialPostTargetModel.id, p.targetId))
      await db.execute(
        sql`UPDATE "SocialPost" SET "status" = 'scheduled' WHERE "id" = ${p.postId}`,
      )
    }
    const failed = await socialPostScheduleService.failMissed()
    expect(failed).toBeGreaterThanOrEqual(1)
    const lateRow = await targetRow(late.targetId)
    const missedRow = await targetRow(veryLate.targetId)
    expect(lateRow.status).toBe("pending")
    expect(missedRow.status).toBe("failed")
    expect(missedRow.errorCode).toBe("missedSchedule")
    expect(missedRow.nextAttemptAt).toBeNull()
    const post = await socialPostRepository.findForWorkspace({
      id: veryLate.postId,
      workspaceId: fixture.workspaceId,
    })
    expect(post?.status).toBe("failed")
  })

  test("the slot index serves the queue lookup, and the schedule row cascades with its destination and workspace", async () => {
    const fixture = await makeFixture()
    await setSchedule(fixture, ["09:00"])
    const explain = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL enable_seqscan = off`)
      const result = await tx.execute<{ "QUERY PLAN": unknown }>(
        sql`EXPLAIN (FORMAT JSON) SELECT "queueSlotAt" FROM "SocialPostTarget" WHERE "publishDestinationId" = ${fixture.destinationId} AND "queueSlotAt" > now()`,
      )
      return JSON.stringify(result.rows[0]?.["QUERY PLAN"])
    })
    // With seq scans off the lookup must be served by a destination index.
    expect(explain).not.toContain("Seq Scan")
    expect(explain).toContain('"Index Name":"SocialPostTarget_')
    const defined = await db.execute<{ indexdef: string }>(
      sql`SELECT indexdef FROM pg_indexes WHERE indexname = 'SocialPostTarget_destination_queueSlotAt_key'`,
    )
    expect(defined.rows[0]?.indexdef).toContain("UNIQUE")
    expect(defined.rows[0]?.indexdef).toContain(
      'WHERE ("queueSlotAt" IS NOT NULL)',
    )

    expect(
      await db
        .select({ id: publishDestinationScheduleModel.id })
        .from(publishDestinationScheduleModel)
        .where(
          eq(
            publishDestinationScheduleModel.publishDestinationId,
            fixture.destinationId,
          ),
        ),
    ).toHaveLength(1)
    await db
      .delete(publishDestinationModel)
      .where(eq(publishDestinationModel.id, fixture.destinationId))
    expect(
      await db
        .select({ id: publishDestinationScheduleModel.id })
        .from(publishDestinationScheduleModel)
        .where(
          eq(publishDestinationScheduleModel.workspaceId, fixture.workspaceId),
        ),
    ).toHaveLength(0)
  })

  test("create with a queue and no posting schedule leaves no draft; with one it is stored scheduled in one write", async () => {
    const fixture = await makeFixture()
    const content = {
      createdById: null,
      createdVia: "api" as const,
      targets: [{ destinationId: fixture.destinationId }],
      text: "hello",
      workspaceId: fixture.workspaceId,
    }
    const countPosts = async () =>
      Number(
        (
          await db.execute<{ n: number }>(
            sql`SELECT count(*)::int AS n FROM "SocialPost" WHERE "workspaceId" = ${fixture.workspaceId}`,
          )
        ).rows[0]?.n,
      )

    const failing = await socialPostScheduleService.prepare({
      plan: { queue: "next" },
      workspaceId: fixture.workspaceId,
    })
    await expect(
      socialPostService.create({ ...content, afterWrite: failing }),
    ).rejects.toMatchObject({ field: "queue" })
    expect(await countPosts()).toBe(0)

    await setSchedule(fixture, ["09:00"])
    const ok = await socialPostScheduleService.prepare({
      plan: { queue: "next" },
      workspaceId: fixture.workspaceId,
    })
    const post = await socialPostService.create({ ...content, afterWrite: ok })
    expect(post.status).toBe("scheduled")
    expect(post.targets[0]?.queueSlotAt).not.toBeNull()
    expect(await countPosts()).toBe(1)
  })

  test("an update whose schedule cannot be applied keeps the post as it was", async () => {
    const fixture = await makeFixture()
    const { postId } = await draft(fixture)
    const failing = await socialPostScheduleService.prepare({
      plan: { queue: "next" },
      workspaceId: fixture.workspaceId,
    })
    await expect(
      socialPostService.update({
        afterWrite: failing,
        id: postId,
        text: "changed",
        workspaceId: fixture.workspaceId,
      }),
    ).rejects.toMatchObject({ field: "queue" })
    const stored = await socialPostRepository.findForWorkspace({
      id: postId,
      workspaceId: fixture.workspaceId,
    })
    expect(stored?.text).toBe("hello")
    expect(stored?.status).toBe("draft")
  })
})
