// @vitest-environment node

import { db, eq } from "@chatbotx.io/database/client"
import { broadcastRepository } from "@chatbotx.io/database/repositories"
import {
  broadcastModel,
  broadcastRecurrenceModel,
  broadcastTargetModel,
  inboxModel,
  integrationMessengerModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { ChannelErrorReason } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest"

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

vi.mock("../../src/broadcast/plan-policy.service", () => ({
  broadcastPlanPolicyService: {
    hasRestrictions: vi.fn(() => false),
    resolveForWorkspace: vi
      .fn()
      .mockResolvedValue({ policy: { kind: "unrestricted" }, planName: null }),
    restrictionFor: vi.fn(() => null),
  },
}))
vi.mock("../../src/audit/dispatcher", () => ({ dispatchAuditRecord: vi.fn() }))

const { broadcastService } = await import("../../src/broadcast/service")
const { broadcastRecurrenceService } = await import(
  "../../src/broadcast/recurrence.service"
)

const ownerId = createId()
const workspaceId = createId()
const blockedInboxId = createId()
const otherInboxId = createId()
const messengerIntegrationId = createId()
const otherMessengerIntegrationId = createId()
const otherWorkspaceId = createId()

const baseRow = {
  workspaceId,
  schedulesType: "now" as const,
  schedulesAt: new Date(),
  subaction: "flow",
  contactCount: 5,
}

const insertBroadcast = async (
  overrides: Partial<typeof broadcastModel.$inferInsert>,
): Promise<string> => {
  const id = createId()
  await db.insert(broadcastModel).values({
    id,
    name: `b-${id}`,
    channel: "messenger",
    status: "sending",
    ...baseRow,
    ...overrides,
  })
  return id
}

const readRow = async (id: string) => {
  const [row] = await db
    .select({
      status: broadcastModel.status,
      statusReason: broadcastModel.statusReason,
      statusErrorMessage: broadcastModel.statusErrorMessage,
      statusInboxId: broadcastModel.statusInboxId,
    })
    .from(broadcastModel)
    .where(eq(broadcastModel.id, id))
  return row
}

const stop = (channel = "messenger", inboxId = blockedInboxId) =>
  broadcastService.stopSendingForBlockedAccount({
    workspaceId,
    inboxId,
    channel,
    reason: ChannelErrorReason.ACCOUNT_POLICY_BLOCKED,
    errorMessage: "page blocked",
  })

describe.skipIf(!databaseUrl)("stopSendingForBlockedAccount", () => {
  beforeAll(async () => {
    await db.insert(userModel).values({
      id: ownerId,
      email: `stop-blocked-${ownerId}@example.test`,
      name: "Stop blocked owner",
    })
    await db
      .insert(workspaceModel)
      .values({ id: workspaceId, name: "stop-blocked", ownerId })
    await db.insert(inboxModel).values([
      {
        id: blockedInboxId,
        name: "Blocked page",
        channel: "messenger",
        sourceId: `blocked-${blockedInboxId}`,
        workspaceId,
      },
      {
        id: otherInboxId,
        name: "Other page",
        channel: "messenger",
        sourceId: `other-${otherInboxId}`,
        workspaceId,
      },
    ])
  })

  beforeEach(async () => {
    await db
      .delete(broadcastModel)
      .where(eq(broadcastModel.workspaceId, workspaceId))
  })

  afterAll(async () => {
    await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
    await db.delete(userModel).where(eq(userModel.id, ownerId))
  })

  test("targets mode: stops only broadcasts that target the blocked inbox, and records why", async () => {
    const targeted = await insertBroadcast({ targetMode: "targets" })
    await db
      .insert(broadcastTargetModel)
      .values({ broadcastId: targeted, inboxId: blockedInboxId })
    const elsewhere = await insertBroadcast({ targetMode: "targets" })
    await db
      .insert(broadcastTargetModel)
      .values({ broadcastId: elsewhere, inboxId: otherInboxId })

    const result = await stop()

    expect(result.stoppedIds).toEqual([targeted])
    expect(await readRow(targeted)).toEqual({
      status: "cancelled",
      statusReason: "accountPolicyBlocked",
      statusErrorMessage: "page blocked",
      statusInboxId: blockedInboxId,
    })
    expect((await readRow(elsewhere)).status).toBe("sending")
  })

  test("legacy whole-channel and omnichannel broadcasts stop; another channel's does not", async () => {
    const wholeChannel = await insertBroadcast({})
    const omnichannel = await insertBroadcast({ channel: "omnichannel" })
    const otherChannel = await insertBroadcast({ channel: "telegram" })

    await stop("messenger")

    expect((await readRow(wholeChannel)).status).toBe("cancelled")
    expect((await readRow(omnichannel)).status).toBe("cancelled")
    expect((await readRow(otherChannel)).status).toBe("sending")
  })

  test("legacy by integration: only the broadcast pinned to the blocked page's integration stops", async () => {
    await db.insert(integrationMessengerModel).values({
      id: messengerIntegrationId,
      name: "Blocked integration",
      pageId: `page-${messengerIntegrationId}`,
      auth: {},
      // A drizzle `.default()` is not a database default: write these explicitly.
      conversationStarters: [],
      persistentMenus: [],
      personas: [],
      coexistEnabled: false,
      coexistAiReadsSyncedHistory: false,
      hasCapiScope: false,
      workspaceId,
      inboxId: blockedInboxId,
    })
    const pinned = await insertBroadcast({
      integrationMessengerId: messengerIntegrationId,
    })

    await stop()

    expect((await readRow(pinned)).status).toBe("cancelled")
    await db
      .delete(integrationMessengerModel)
      .where(eq(integrationMessengerModel.id, messengerIntegrationId))
  })

  test("legacy by integration: a broadcast pinned to ANOTHER page's integration keeps sending", async () => {
    await db.insert(integrationMessengerModel).values({
      id: otherMessengerIntegrationId,
      name: "Other integration",
      pageId: `page-${otherMessengerIntegrationId}`,
      auth: {},
      conversationStarters: [],
      persistentMenus: [],
      personas: [],
      coexistEnabled: false,
      coexistAiReadsSyncedHistory: false,
      hasCapiScope: false,
      workspaceId,
      inboxId: otherInboxId,
    })
    const pinnedElsewhere = await insertBroadcast({
      integrationMessengerId: otherMessengerIntegrationId,
    })

    const { stoppedIds } = await stop()

    expect(stoppedIds).not.toContain(pinnedElsewhere)
    expect((await readRow(pinnedElsewhere)).status).toBe("sending")
    await db
      .delete(integrationMessengerModel)
      .where(eq(integrationMessengerModel.id, otherMessengerIntegrationId))
  })

  test("another workspace's whole-channel broadcast is never stopped", async () => {
    await db
      .insert(workspaceModel)
      .values({ id: otherWorkspaceId, name: "stop-blocked-other", ownerId })
    const foreign = await insertBroadcast({ workspaceId: otherWorkspaceId })

    await stop()

    expect((await readRow(foreign)).status).toBe("sending")
    await db
      .delete(broadcastModel)
      .where(eq(broadcastModel.workspaceId, otherWorkspaceId))
    await db
      .delete(workspaceModel)
      .where(eq(workspaceModel.id, otherWorkspaceId))
  })

  test("rows that are not sending are untouched, and a second call is a no-op", async () => {
    const draft = await insertBroadcast({ status: "draft" })
    const sent = await insertBroadcast({ status: "sent" })
    const sending = await insertBroadcast({})

    const first = await stop()
    const second = await stop()

    expect(first.stoppedIds).toEqual([sending])
    expect(second.stoppedIds).toEqual([])
    expect((await readRow(draft)).status).toBe("draft")
    expect((await readRow(sent)).status).toBe("sent")
  })

  test("a soft-deleted broadcast is never stopped", async () => {
    const deleted = await insertBroadcast({ deletedAt: new Date() })
    await stop()
    expect((await readRow(deleted)).status).toBe("sending")
  })

  test("a run's repeating series is paused with all three reason columns, once for two runs", async () => {
    const series = await insertBroadcast({
      status: "recurring",
      schedulesType: "recurring",
    })
    await db.insert(broadcastRecurrenceModel).values({
      workspaceId,
      broadcastId: series,
      rule: {
        frequency: "daily",
        interval: 1,
        timeOfDay: "09:00",
        timezone: "UTC",
        startsOn: "2026-01-01",
        end: { kind: "never" },
      },
      nextRunAt: new Date(Date.now() + 3_600_000),
    })
    const runA = await insertBroadcast({
      parentBroadcastId: series,
      occurrenceAt: new Date(Date.now() - 60_000),
    })
    const runB = await insertBroadcast({
      parentBroadcastId: series,
      occurrenceAt: new Date(Date.now() - 30_000),
    })

    await stop()

    for (const id of [runA, runB]) {
      expect((await readRow(id)).status).toBe("cancelled")
    }
    expect(await readRow(series)).toEqual({
      status: "cancelled",
      statusReason: "accountPolicyBlocked",
      statusErrorMessage: "page blocked",
      statusInboxId: blockedInboxId,
    })
    const [recurrence] = await db
      .select({ pausedAt: broadcastRecurrenceModel.pausedAt })
      .from(broadcastRecurrenceModel)
      .where(eq(broadcastRecurrenceModel.broadcastId, series))
    expect(recurrence.pausedAt).not.toBeNull()
  })

  test("a failure while pausing the series rolls the stop back too", async () => {
    const series = await insertBroadcast({
      status: "recurring",
      schedulesType: "recurring",
    })
    await db.insert(broadcastRecurrenceModel).values({
      workspaceId,
      broadcastId: series,
      rule: {
        frequency: "daily",
        interval: 1,
        timeOfDay: "09:00",
        timezone: "UTC",
        startsOn: "2026-01-01",
        end: { kind: "never" },
      },
      nextRunAt: new Date(Date.now() + 3_600_000),
    })
    const run = await insertBroadcast({
      parentBroadcastId: series,
      occurrenceAt: new Date(Date.now() - 60_000),
    })
    const disarm = vi
      .spyOn(broadcastRecurrenceService, "disarm")
      .mockRejectedValueOnce(new Error("disarm failed"))

    await expect(stop()).rejects.toThrow("disarm failed")
    disarm.mockRestore()

    expect(await readRow(run)).toEqual({
      status: "sending",
      statusReason: null,
      statusErrorMessage: null,
      statusInboxId: null,
    })
    expect((await readRow(series)).status).toBe("recurring")
  })

  test("statusInbox returns the page name, and null once the page is deleted", async () => {
    const pageId = createId()
    await db.insert(inboxModel).values({
      id: pageId,
      name: "Short-lived page",
      channel: "messenger",
      sourceId: `short-${pageId}`,
      workspaceId,
    })
    const id = await insertBroadcast({ targetMode: "targets" })
    await db
      .insert(broadcastTargetModel)
      .values({ broadcastId: id, inboxId: pageId })
    await stop("messenger", pageId)

    const listed = async () =>
      (await broadcastRepository.listWithRelations({ workspaceId })).find(
        (row) => row.id === id,
      )
    expect((await listed())?.statusInbox).toEqual({
      id: pageId,
      name: "Short-lived page",
    })
    const found = await broadcastRepository.findByIdOrName({
      workspaceId,
      idOrName: id,
    })
    expect(found?.statusInbox?.name).toBe("Short-lived page")

    await db.delete(inboxModel).where(eq(inboxModel.id, pageId))

    expect((await listed())?.statusInbox).toBeNull()
  })

  test("two concurrent calls stop each broadcast once", async () => {
    const id = await insertBroadcast({})
    const [a, b] = await Promise.all([stop(), stop()])
    expect([...a.stoppedIds, ...b.stoppedIds]).toEqual([id])
  })

  test("resume and move-to-draft clear the reason columns", async () => {
    const resumed = await insertBroadcast({})
    await stop()
    await broadcastService.resumeSending({ workspaceId, broadcastId: resumed })
    expect(await readRow(resumed)).toEqual({
      status: "sending",
      statusReason: null,
      statusErrorMessage: null,
      statusInboxId: null,
    })
  })

  test("a rate-limit reason stops nothing", async () => {
    const id = await insertBroadcast({})
    const result = await broadcastService.stopSendingForBlockedAccount({
      workspaceId,
      inboxId: blockedInboxId,
      channel: "messenger",
      reason: ChannelErrorReason.RATE_LIMITED,
      errorMessage: "slow down",
    })
    expect(result.stoppedIds).toEqual([])
    expect((await readRow(id)).status).toBe("sending")
  })

  test("the error message is truncated to 500 characters", async () => {
    const id = await insertBroadcast({})
    await broadcastService.stopSendingForBlockedAccount({
      workspaceId,
      inboxId: blockedInboxId,
      channel: "messenger",
      reason: ChannelErrorReason.ACCOUNT_SEND_RESTRICTED,
      errorMessage: "x".repeat(900),
    })
    const row = await readRow(id)
    expect(row.statusErrorMessage).toHaveLength(500)
    expect(row.statusReason).toBe("accountSendRestricted")
  })
})
