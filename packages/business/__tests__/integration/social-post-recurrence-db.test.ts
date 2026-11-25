// @vitest-environment node

/**
 * Recurring posts against a real Postgres: the materialiser's idempotence
 * (replay, two concurrent runs), clone completeness, the late-slot policy and
 * its bound, pause / resume / skip / restore, slot identity across time zones
 * and the EXPLAIN of the due scan. Commits for real, so every test deletes its
 * workspace afterwards.
 */

import { db, eq, sql } from "@chatbotx.io/database/client"
import {
  socialPostRecurrenceRepository,
  socialPostRepository,
} from "@chatbotx.io/database/repositories"
import {
  inboxModel,
  postTopicModel,
  publishDestinationModel,
  socialPostModel,
  socialPostRecurrenceModel,
  socialPostRecurrenceOccurrenceModel,
  socialPostTargetModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import type { RecurrenceRule } from "@chatbotx.io/utils/recurrence"
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

const { socialPostRecurrenceService, RECURRENCE_MAX_SLOTS_PER_RUN } =
  await import("../../src/social-post/recurrence.service")
const { socialPostService } = await import("../../src/social-post/service")

const databaseUrl = realDatabaseUrl()
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

type Fixture = {
  destinationId: string
  userId: string
  workspaceId: string
}

const dailyRule = (
  overrides: Partial<RecurrenceRule> = {},
): RecurrenceRule => ({
  end: { kind: "never" },
  frequency: "daily",
  interval: 1,
  startsOn: "2026-01-01",
  timeOfDay: "09:00",
  timezone: "UTC",
  ...overrides,
})

describe.skipIf(!databaseUrl)("recurring posts on a real database", () => {
  const created: Fixture[] = []

  const makeFixture = async (): Promise<Fixture> => {
    const suffix = `${Date.now()}-${Math.random()}`
    const [user] = await db
      .insert(userModel)
      .values({ email: `recur-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `recur-${suffix}`, ownerId: user.id })
      .returning({ id: workspaceModel.id })
    const [inbox] = await db
      .insert(inboxModel)
      .values({
        channel: "messenger",
        name: "page",
        sourceId: `page-${suffix}`,
        workspaceId: workspace.id,
      })
      .returning({ id: inboxModel.id })
    const [destination] = await db
      .insert(publishDestinationModel)
      .values({
        inboxId: inbox.id,
        provider: "facebook",
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
    vi.restoreAllMocks()
    for (const { workspaceId, userId } of created.splice(0)) {
      await db
        .delete(socialPostRecurrenceOccurrenceModel)
        .where(eq(socialPostRecurrenceOccurrenceModel.workspaceId, workspaceId))
      await db
        .delete(socialPostTargetModel)
        .where(eq(socialPostTargetModel.workspaceId, workspaceId))
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, userId))
    }
  })

  /** A repeating template (a draft) whose next slot is `slotAt`, due now. */
  const template = async (
    fixture: Fixture,
    options: { rule?: RecurrenceRule; slotAt?: Date } = {},
  ) => {
    const post = await socialPostService.create({
      createdById: null,
      createdVia: "api",
      targets: [{ destinationId: fixture.destinationId }],
      text: "weekly tip",
      workspaceId: fixture.workspaceId,
    })
    const key = { socialPostId: post.id, workspaceId: fixture.workspaceId }
    await socialPostRecurrenceService.setRule({
      ...key,
      rule: options.rule ?? dailyRule(),
    })
    const [row] = await db
      .select()
      .from(socialPostRecurrenceModel)
      .where(eq(socialPostRecurrenceModel.socialPostId, post.id))
    const slotAt = options.slotAt ?? new Date(Date.now() - MINUTE_MS)
    await db
      .update(socialPostRecurrenceModel)
      .set({ nextRunAt: slotAt })
      .where(eq(socialPostRecurrenceModel.id, row.id))
    return { key, recurrenceId: row.id, series: { id: row.id, ...key } }
  }

  const ledger = async (recurrenceId: string) =>
    await db
      .select()
      .from(socialPostRecurrenceOccurrenceModel)
      .where(eq(socialPostRecurrenceOccurrenceModel.recurrenceId, recurrenceId))
      .orderBy(socialPostRecurrenceOccurrenceModel.occurrenceAt)

  const copiesOf = async (templateId: string) =>
    await db
      .select()
      .from(socialPostModel)
      .where(eq(socialPostModel.parentSocialPostId, templateId))

  test("a due slot becomes a scheduled copy of the template, and the series moves on", async () => {
    const fixture = await makeFixture()
    const slot = new Date(Date.now() - MINUTE_MS)
    const { key, recurrenceId, series } = await template(fixture, {
      slotAt: slot,
    })

    const result = await socialPostRecurrenceService.materializeSeries(series)

    expect(result.created).toBe(1)
    const [copy] = await copiesOf(key.socialPostId)
    expect(copy.status).toBe("scheduled")
    expect(copy.occurrenceAt?.getTime()).toBe(slot.getTime())
    const targets = await db
      .select()
      .from(socialPostTargetModel)
      .where(eq(socialPostTargetModel.socialPostId, copy.id))
    expect(targets).toHaveLength(1)
    expect(targets[0].scheduledAt?.getTime()).toBe(slot.getTime())
    expect(targets[0].nextAttemptAt?.getTime()).toBe(slot.getTime())
    const [row] = await ledger(recurrenceId)
    expect(row.outcome).toBe("created")
    expect(row.socialPostId).toBe(copy.id)
    const [state] = await db
      .select()
      .from(socialPostRecurrenceModel)
      .where(eq(socialPostRecurrenceModel.id, recurrenceId))
    expect(state.occurrenceCount).toBe(1)
    expect(state.nextRunAt && state.nextRunAt > new Date()).toBe(true)
    // The template itself stays a draft.
    const [parent] = await db
      .select()
      .from(socialPostModel)
      .where(eq(socialPostModel.id, key.socialPostId))
    expect(parent.status).toBe("draft")
  })

  test("a replayed slot makes no second post", async () => {
    const fixture = await makeFixture()
    const slot = new Date(Date.now() - MINUTE_MS)
    const { key, recurrenceId, series } = await template(fixture, {
      slotAt: slot,
    })
    await socialPostRecurrenceService.materializeSeries(series)
    // Pretend the cursor commit was lost: the same slot is due again.
    await db
      .update(socialPostRecurrenceModel)
      .set({ nextRunAt: slot, occurrenceCount: 0 })
      .where(eq(socialPostRecurrenceModel.id, recurrenceId))

    await socialPostRecurrenceService.materializeSeries(series)

    expect(await copiesOf(key.socialPostId)).toHaveLength(1)
    expect(await ledger(recurrenceId)).toHaveLength(1)
  })

  test("two materialisers racing on one slot make one post", async () => {
    const fixture = await makeFixture()
    const { key, recurrenceId, series } = await template(fixture)

    await Promise.all([
      socialPostRecurrenceService.materializeSeries(series),
      socialPostRecurrenceService.materializeSeries(series),
    ])

    expect(await copiesOf(key.socialPostId)).toHaveLength(1)
    expect(await ledger(recurrenceId)).toHaveLength(1)
  })

  test("a copy carries the template's text, link, destinations, files and topics", async () => {
    const fixture = await makeFixture()
    const { key, series } = await template(fixture)
    const [topic] = await db
      .insert(postTopicModel)
      .values({ name: `t-${Date.now()}`, workspaceId: fixture.workspaceId })
      .returning({ id: postTopicModel.id })
    await db.transaction(async (tx) => {
      await socialPostRepository.replaceTopics(
        { postTopicIds: [topic.id], socialPostId: key.socialPostId },
        tx,
      )
      await socialPostRepository.insertPostMedia(
        {
          rows: [
            {
              altText: "alt",
              durationMs: null,
              height: 100,
              id: createId(),
              kind: "image",
              mediaLibraryFileId: null,
              mimeType: "image/jpeg",
              path: "a/b.jpg",
              position: 0,
              size: 1000,
              width: 100,
              workspaceId: fixture.workspaceId,
            },
          ],
          socialPostId: key.socialPostId,
        },
        tx,
      )
    })

    await db
      .update(socialPostTargetModel)
      .set({ contentType: "image" })
      .where(eq(socialPostTargetModel.socialPostId, key.socialPostId))

    await socialPostRecurrenceService.materializeSeries(series)

    const [copy] = await copiesOf(key.socialPostId)
    const dto = await socialPostService.get({
      id: copy.id,
      workspaceId: fixture.workspaceId,
    })
    expect(dto.text).toBe("weekly tip")
    expect(dto.parentSocialPostId).toBe(key.socialPostId)
    expect(dto.targets.map((t) => t.destination.id)).toEqual([
      fixture.destinationId,
    ])
    expect(dto.topics.map((t) => t.id)).toEqual([topic.id])
    expect(dto.media.map((m) => m.altText)).toEqual(["alt"])
  })

  test("a slot more than the late window old is recorded as missed, not created", async () => {
    const fixture = await makeFixture()
    const { key, recurrenceId, series } = await template(fixture, {
      slotAt: new Date(Date.now() - 7 * HOUR_MS),
    })

    const result = await socialPostRecurrenceService.materializeSeries(series)

    expect(result.missed).toBeGreaterThanOrEqual(1)
    const rows = await ledger(recurrenceId)
    expect(rows[0].outcome).toBe("missed")
    expect(rows[0].socialPostId).toBeNull()
    // Slots after the late window (today's, if due) may be created, never the old one.
    const copies = await copiesOf(key.socialPostId)
    for (const copy of copies) {
      expect(copy.occurrenceAt?.getTime()).toBeGreaterThan(
        Date.now() - 6 * HOUR_MS,
      )
    }
  })

  test("catch-up after a long outage settles at most the bounded number of slots per run", async () => {
    const fixture = await makeFixture()
    const { recurrenceId, series } = await template(fixture, {
      slotAt: new Date(Date.now() - 40 * DAY_MS),
    })

    const first = await socialPostRecurrenceService.materializeSeries(series)

    expect(first.created + first.missed + first.excluded + first.skipped).toBe(
      RECURRENCE_MAX_SLOTS_PER_RUN,
    )
    expect(await ledger(recurrenceId)).toHaveLength(
      RECURRENCE_MAX_SLOTS_PER_RUN,
    )
    await socialPostRecurrenceService.materializeSeries(series)
    expect((await ledger(recurrenceId)).length).toBe(
      2 * RECURRENCE_MAX_SLOTS_PER_RUN,
    )
  })

  test("a paused series is neither due nor materialised; resume continues from the next slot after now", async () => {
    const fixture = await makeFixture()
    const { key, recurrenceId, series } = await template(fixture)

    await socialPostRecurrenceService.pause(key)
    expect(
      (await socialPostRecurrenceService.listDue(100)).map((s) => s.id),
    ).not.toContain(recurrenceId)
    const settled = await socialPostRecurrenceService.materializeSeries(series)
    expect(settled.created).toBe(0)
    expect(await copiesOf(key.socialPostId)).toHaveLength(0)

    const resumed = await socialPostRecurrenceService.resume(key)
    expect(resumed.state).toBe("active")
    expect(resumed.nextRunAt && resumed.nextRunAt > new Date()).toBe(true)
    expect(await ledger(recurrenceId)).toHaveLength(0)
  })

  test("skipping a date makes the slot excluded; restoring brings it back; a settled date cannot change", async () => {
    const fixture = await makeFixture()
    const { key, recurrenceId, series } = await template(fixture)
    const dto = await socialPostRecurrenceService.get(key)
    const upcoming = dto.upcoming[1]

    await socialPostRecurrenceService.setExcluded({
      ...key,
      dates: [upcoming.date],
      excluded: true,
    })
    let state = await socialPostRecurrenceService.get(key)
    expect(state.rule.excludeDates).toEqual([upcoming.date])
    expect(state.upcoming.find((s) => s.date === upcoming.date)?.excluded).toBe(
      true,
    )
    state = await socialPostRecurrenceService.setExcluded({
      ...key,
      dates: [upcoming.date],
      excluded: false,
    })
    expect(state.rule.excludeDates).toBeUndefined()

    // The due slot is excluded when its own date is skipped.
    const dueSlot = new Date(Date.now() - MINUTE_MS)
    await db
      .update(socialPostRecurrenceModel)
      .set({ nextRunAt: dueSlot })
      .where(eq(socialPostRecurrenceModel.id, recurrenceId))
    const dueDate = dueSlot.toISOString().slice(0, 10)
    await db
      .update(socialPostRecurrenceModel)
      .set({
        rule: dailyRule({ excludeDates: [dueDate] }),
      })
      .where(eq(socialPostRecurrenceModel.id, recurrenceId))
    const result = await socialPostRecurrenceService.materializeSeries(series)
    expect(result.excluded).toBeGreaterThanOrEqual(1)
    expect(await copiesOf(key.socialPostId)).toHaveLength(0)
    const [row] = await ledger(recurrenceId)
    expect(row.outcome).toBe("excluded")
    await expect(
      socialPostRecurrenceService.setExcluded({
        ...key,
        dates: [dueDate],
        excluded: false,
      }),
    ).rejects.toMatchObject({ code: "socialPostOccurrenceSettled" })
  })

  test("a template that can no longer publish leaves a skipped row and the series goes on", async () => {
    const fixture = await makeFixture()
    const { key, recurrenceId, series } = await template(fixture)
    // The page's inbox disconnects: the destination can no longer publish.
    await db
      .update(inboxModel)
      .set({ status: "disconnected" })
      .where(eq(inboxModel.workspaceId, fixture.workspaceId))

    const result = await socialPostRecurrenceService.materializeSeries(series)

    expect(result.skipped).toBe(1)
    expect(await copiesOf(key.socialPostId)).toHaveLength(0)
    const [row] = await ledger(recurrenceId)
    expect(row.outcome).toBe("skipped")
  })

  test("slot identity: one local text may name two instants, one instant two texts", async () => {
    const fixture = await makeFixture()
    const { recurrenceId } = await template(fixture)
    const insert = (localSlot: string, at: string) =>
      db.transaction((tx) =>
        socialPostRecurrenceRepository.insertLedgerRow(
          {
            localSlot,
            occurrenceAt: new Date(at),
            outcome: "created",
            recurrenceId,
            socialPostId: null,
            workspaceId: fixture.workspaceId,
          },
          tx,
        ),
      )
    // Fall-back day: 01:30 happens twice in New York.
    expect(
      await insert("2026-11-01 01:30", "2026-11-01T05:30:00Z"),
    ).not.toBeNull()
    expect(
      await insert("2026-11-01 01:30", "2026-11-01T06:30:00Z"),
    ).not.toBeNull()
    expect(await insert("2026-11-01 01:30", "2026-11-01T06:30:00Z")).toBeNull()
    // A zone edit: another text for an instant already taken.
    expect(
      await insert("2026-11-01 14:30", "2026-11-01T06:30:00Z"),
    ).not.toBeNull()
  })

  test("the due scan uses the partial index, and ended or paused series are outside it", async () => {
    await db.execute(sql`SET enable_seqscan = off`)
    try {
      const plan = await db.execute<{ "QUERY PLAN": string }>(sql`
        EXPLAIN SELECT "id" FROM "SocialPostRecurrence"
        WHERE "endedAt" IS NULL AND "pausedAt" IS NULL AND "nextRunAt" <= now()
        ORDER BY "nextRunAt", "id" LIMIT 100`)
      const text = plan.rows.map((row) => row["QUERY PLAN"]).join("\n")
      expect(text).toContain("SocialPostRecurrence_due_idx")
    } finally {
      await db.execute(sql`RESET enable_seqscan`)
    }
  })
})
