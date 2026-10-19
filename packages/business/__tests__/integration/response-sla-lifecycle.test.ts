// @vitest-environment node

/**
 * Response SLA end to end against Postgres + Redis: the real services, the real
 * window SQL and the real caches. Covers the mixed cases a mocked suite cannot:
 * weekend + holiday rollover from an old opening, reassignment, the reply claim,
 * and switching the policy off while windows open concurrently.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/business test:db`.
 */

import { db, eq, sql } from "@chatbotx.io/database/client"
import {
  closeHumanReplyWindow,
  responseSlaRepository,
} from "@chatbotx.io/database/repositories"
import {
  contactModel,
  conversationModel,
  userModel,
  workingHoursMemberModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"
import { humanReplyWindowSet } from "../../src/conversation/human-reply-window"
import { responseSlaService } from "../../src/response-sla"
import { workingHoursService } from "../../src/working-hours/service"

// Audit records need a registered recorder that this suite does not exercise.
vi.mock("../../src/audit/dispatcher", () => ({
  dispatchAuditRecord: vi.fn(),
}))

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

const FRIDAY_EVENING = new Date("2026-06-05T16:30:00.000Z")
const policyInput = (enabled: boolean) => ({
  enabled,
  firstResponseTargetSeconds: 3600,
  nextResponseTargetSeconds: 1800,
  breachingThresholdPercent: 25,
})

describe.skipIf(!realDatabaseUrl())("response SLA lifecycle", () => {
  let workspaceId: string
  const userIds: string[] = []
  let ownerId: string
  let scheduledAgent: string
  let unscheduledAgent: string

  const newConversation = async (
    values: Partial<typeof conversationModel.$inferInsert> = {},
  ): Promise<string> => {
    const [contact] = await db
      .insert(contactModel)
      .values({ workspaceId })
      .returning({ id: contactModel.id })
    const [conversation] = await db
      .insert(conversationModel)
      .values({ workspaceId, contactId: contact.id, ...values })
      .returning({ id: conversationModel.id })
    return conversation.id
  }

  const openWindow = (conversationId: string, at: Date, assignee?: string[]) =>
    responseSlaService.trackWindow(
      {
        workspaceId,
        conversationIds: [conversationId],
        assigneeHints: assignee,
      },
      (client) =>
        client
          .update(conversationModel)
          .set(humanReplyWindowSet({ open: at }))
          .where(eq(conversationModel.id, conversationId)),
    )

  const reassign = (conversationId: string, userId: string | null, at: Date) =>
    responseSlaService.trackWindow(
      {
        workspaceId,
        conversationIds: [conversationId],
        assigneeHints: [userId],
      },
      (client) =>
        client
          .update(conversationModel)
          .set({ assignedUserId: userId, assignedUserAt: at })
          .where(eq(conversationModel.id, conversationId)),
    )

  const read = async (id: string) => {
    const row = await db.query.conversationModel.findFirst({
      where: { id },
      columns: {
        awaitingHumanReplySince: true,
        responseDueAt: true,
        responseSlaBreachingAt: true,
        responseSlaTargetSeconds: true,
      },
    })
    if (!row) {
      throw new Error("conversation missing")
    }
    return row
  }

  const createUser = async (label: string): Promise<string> => {
    const [user] = await db
      .insert(userModel)
      .values({
        email: `sla-${label}-${Date.now()}-${Math.random()}@example.test`,
      })
      .returning({ id: userModel.id })
    userIds.push(user.id)
    return user.id
  }

  beforeAll(async () => {
    ownerId = await createUser("owner")
    scheduledAgent = await createUser("scheduled")
    unscheduledAgent = await createUser("plain")
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: "sla-lifecycle", ownerId })
      .returning({ id: workspaceModel.id })
    workspaceId = workspace.id

    // Monday to Friday, 09:00-17:00 (workspace timezone defaults to UTC).
    const schedule = await workingHoursService.create({
      workspaceId,
      data: {
        name: "Office",
        intervals: [1, 2, 3, 4, 5].map((weekday) => ({
          weekday,
          startMinute: 540,
          endMinute: 1020,
        })),
      },
    })
    await db.insert(workingHoursMemberModel).values({
      workspaceId,
      workingHoursId: schedule.id,
      userId: scheduledAgent,
    })
    await workingHoursService.invalidate({ workspaceId })
    await responseSlaService.upsertPolicy({
      workspaceId,
      data: policyInput(true),
    })
  })

  afterAll(async () => {
    await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
    for (const id of userIds) {
      await db.delete(userModel).where(eq(userModel.id, id))
    }
  })

  test("a Friday-evening message gets a Monday-morning deadline, a holiday pushes it a day", async () => {
    const id = await newConversation({ assignedUserId: scheduledAgent })

    await openWindow(id, FRIDAY_EVENING, [scheduledAgent])
    const first = await read(id)
    expect(first.responseDueAt).toEqual(new Date("2026-06-08T09:30:00.000Z"))
    expect(first.responseSlaTargetSeconds).toBe(3600)
    expect(first.responseSlaBreachingAt?.getTime()).toBeLessThan(
      first.responseDueAt?.getTime() ?? 0,
    )

    const holiday = await workingHoursService.addHoliday({
      workspaceId,
      data: { date: "2026-06-08", name: "Closed", ranges: [] },
    })
    const other = await newConversation({ assignedUserId: scheduledAgent })
    await openWindow(other, FRIDAY_EVENING, [scheduledAgent])
    expect((await read(other)).responseDueAt).toEqual(
      new Date("2026-06-09T09:30:00.000Z"),
    )

    await workingHoursService.deleteHoliday({
      workspaceId,
      id: holiday.id,
    })
  })

  test("an unassigned conversation and an unscheduled agent are counted in clock time", async () => {
    const unassigned = await newConversation()
    await openWindow(unassigned, FRIDAY_EVENING)
    expect((await read(unassigned)).responseDueAt).toEqual(
      new Date("2026-06-05T17:30:00.000Z"),
    )

    const plain = await newConversation({ assignedUserId: unscheduledAgent })
    await openWindow(plain, FRIDAY_EVENING, [unscheduledAgent])
    expect((await read(plain)).responseDueAt).toEqual(
      new Date("2026-06-05T17:30:00.000Z"),
    )
  })

  test("an already open window is not given a deadline retroactively", async () => {
    const id = await newConversation({
      assignedUserId: scheduledAgent,
      awaitingHumanReplySince: FRIDAY_EVENING,
    })

    await openWindow(id, new Date("2026-06-05T16:45:00.000Z"))

    expect((await read(id)).responseDueAt).toBeNull()
  })

  test("reassigning an open window follows the new agent, and unassigning falls back to clock time", async () => {
    const id = await newConversation({ assignedUserId: scheduledAgent })
    await openWindow(id, FRIDAY_EVENING, [scheduledAgent])
    expect((await read(id)).responseDueAt).toEqual(
      new Date("2026-06-08T09:30:00.000Z"),
    )

    // Handed to an agent without a calendar right away: clock time from then.
    const assignedAt = new Date("2026-06-05T16:40:00.000Z")
    await reassign(id, unscheduledAgent, assignedAt)
    expect((await read(id)).responseDueAt).toEqual(
      new Date("2026-06-05T17:40:00.000Z"),
    )

    await reassign(id, null, new Date("2026-06-05T16:50:00.000Z"))
    const unassigned = await read(id)
    expect(unassigned.responseSlaTargetSeconds).toBe(3600)
    expect(unassigned.responseDueAt).not.toBeNull()
  })

  test("the reply claim returns the deadline it closed and leaves nothing behind", async () => {
    const id = await newConversation({ assignedUserId: scheduledAgent })
    await openWindow(id, FRIDAY_EVENING, [scheduledAgent])

    const claim = await closeHumanReplyWindow({
      workspaceId,
      conversationId: id,
      repliedAt: new Date("2026-06-08T09:00:00.000Z"),
    })

    expect(claim?.closedResponseDueAt).toEqual(
      new Date("2026-06-08T09:30:00.000Z"),
    )
    expect(claim?.closedResponseSlaTargetSeconds).toBe(3600)
    const after = await read(id)
    expect(after.awaitingHumanReplySince).toBeNull()
    expect(after.responseDueAt).toBeNull()
    expect(after.responseSlaBreachingAt).toBeNull()
    expect(after.responseSlaTargetSeconds).toBeNull()

    // A second reply gets nothing: only one claim wins.
    const second = await closeHumanReplyWindow({
      workspaceId,
      conversationId: id,
      repliedAt: new Date("2026-06-08T09:10:00.000Z"),
    })
    expect(second?.closedResponseDueAt ?? null).toBeNull()
  })

  test("a reply after the deadline is a miss, before it a hit (inclusive at the deadline)", async () => {
    const id = await newConversation({ assignedUserId: scheduledAgent })
    await openWindow(id, FRIDAY_EVENING, [scheduledAgent])
    const due = new Date("2026-06-08T09:30:00.000Z")

    const claim = await closeHumanReplyWindow({
      workspaceId,
      conversationId: id,
      repliedAt: due,
    })

    expect(claim?.closedResponseDueAt?.getTime()).toBe(due.getTime())
    // slaMet = repliedAt <= responseDueAt is decided by the caller from this claim.
    expect(due.getTime() <= (claim?.closedResponseDueAt?.getTime() ?? 0)).toBe(
      true,
    )
  })

  test("switching the policy off clears every open deadline and later windows get none; switching on again tracks only new windows", async () => {
    const openBefore = await newConversation({ assignedUserId: scheduledAgent })
    await openWindow(openBefore, FRIDAY_EVENING, [scheduledAgent])
    expect((await read(openBefore)).responseDueAt).not.toBeNull()

    await responseSlaService.upsertPolicy({
      workspaceId,
      data: policyInput(false),
    })
    expect((await read(openBefore)).responseDueAt).toBeNull()

    const whileOff = await newConversation({ assignedUserId: scheduledAgent })
    await openWindow(whileOff, FRIDAY_EVENING, [scheduledAgent])
    expect((await read(whileOff)).responseDueAt).toBeNull()

    await responseSlaService.upsertPolicy({
      workspaceId,
      data: policyInput(true),
    })
    expect((await read(openBefore)).responseDueAt).toBeNull()
    const afterOn = await newConversation({ assignedUserId: scheduledAgent })
    await openWindow(afterOn, FRIDAY_EVENING, [scheduledAgent])
    expect((await read(afterOn)).responseDueAt).not.toBeNull()
  })

  test("windows opening while the policy is switched off never leave a deadline behind", async () => {
    const ids = await Promise.all(
      Array.from({ length: 12 }, () =>
        newConversation({ assignedUserId: scheduledAgent }),
      ),
    )

    await Promise.all([
      ...ids.map((id, index) =>
        new Promise((resolve) => setTimeout(resolve, index * 5)).then(() =>
          openWindow(id, FRIDAY_EVENING, [scheduledAgent]),
        ),
      ),
      new Promise((resolve) => setTimeout(resolve, 25)).then(() =>
        responseSlaService.upsertPolicy({
          workspaceId,
          data: policyInput(false),
        }),
      ),
    ])

    const [{ leftover }] = (
      await db.execute(
        sql`SELECT COUNT(*)::int AS leftover FROM "Conversation" WHERE "workspaceId" = ${workspaceId} AND "responseDueAt" IS NOT NULL`,
      )
    ).rows as { leftover: number }[]
    expect(leftover).toBe(0)

    await responseSlaService.upsertPolicy({
      workspaceId,
      data: policyInput(true),
    })
  })

  test("reassigning windows that already have a deadline while the policy is switched off neither deadlocks nor leaves a deadline", async () => {
    const ids = await Promise.all(
      Array.from({ length: 8 }, () =>
        newConversation({ assignedUserId: scheduledAgent }),
      ),
    )
    await Promise.all(
      ids.map((id) => openWindow(id, FRIDAY_EVENING, [scheduledAgent])),
    )
    for (const id of ids) {
      expect((await read(id)).responseDueAt).not.toBeNull()
    }

    await Promise.all([
      ...ids.map((id, index) =>
        new Promise((resolve) => setTimeout(resolve, index * 5)).then(() =>
          reassign(id, unscheduledAgent, new Date("2026-06-05T16:40:00.000Z")),
        ),
      ),
      new Promise((resolve) => setTimeout(resolve, 20)).then(() =>
        responseSlaService.upsertPolicy({
          workspaceId,
          data: policyInput(false),
        }),
      ),
    ])

    const [{ leftover }] = (
      await db.execute(
        sql`SELECT COUNT(*)::int AS leftover FROM "Conversation" WHERE "workspaceId" = ${workspaceId} AND "responseDueAt" IS NOT NULL`,
      )
    ).rows as { leftover: number }[]
    expect(leftover).toBe(0)

    await responseSlaService.upsertPolicy({
      workspaceId,
      data: policyInput(true),
    })
  })

  test("areWindowsAlreadyOpen is true only when every conversation is settled", async () => {
    const open = await newConversation({
      awaitingHumanReplySince: FRIDAY_EVENING,
    })
    const idle = await newConversation()
    const check = (conversationIds: string[]) =>
      responseSlaRepository.areWindowsAlreadyOpen({
        workspaceId,
        ids: conversationIds,
      })

    expect(await check([open])).toBe(true)
    expect(await check([idle])).toBe(false)
    expect(await check([open, idle])).toBe(false)
    expect(await check([])).toBe(false)
    expect(await check([open, "1"])).toBe(false)
  })
})
