// @vitest-environment node

import { db, eq, sql } from "@chatbotx.io/database/client"
import {
  broadcastModel,
  flowModel,
  userModel,
  userQuotaModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { broadcastSubactions } from "@chatbotx.io/utils/broadcast"
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest"

/** The shared Vitest preset uses a non-routable port so DB suites self-skip. */
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
const mocks = vi.hoisted(() => ({
  workspaceFind: vi.fn(),
}))

vi.mock("../../src/keys", () => ({ isCloud: () => true }))
vi.mock("../../src/workspace/service", () => ({
  workspaceService: { find: mocks.workspaceFind },
}))
vi.mock("../../src/user-quota/service", () => ({
  userQuotaService: {
    getPlanIdentity: vi.fn().mockResolvedValue({
      isOnTrial: true,
      planName: "Trial",
    }),
  },
}))
vi.mock("../../src/audit/dispatcher", () => ({
  dispatchAuditRecord: vi.fn().mockResolvedValue(undefined),
}))

const { broadcastPlanPolicyService } = await import(
  "../../src/broadcast/plan-policy.service"
)
const { broadcastService } = await import("../../src/broadcast/service")

const ownerId = createId()
const workspaceIds = [createId(), createId()] as const
const flowId = createId()
const insertedBroadcastIds = new Set<string>()

const insertDraft = async (input: {
  workspaceId: string
  channel: "messenger" | "whatsapp"
  sendRatePerMinute?: number | null
  targetMode?: "channel" | "targets"
}): Promise<string> => {
  const id = createId()
  insertedBroadcastIds.add(id)
  await db.insert(broadcastModel).values({
    id,
    workspaceId: input.workspaceId,
    name: `Race ${id}`,
    status: "draft",
    schedulesType: "now",
    schedulesAt: new Date(),
    channel: input.channel,
    subaction:
      input.channel === "messenger"
        ? broadcastSubactions.enum.messengerActiveContacts
        : broadcastSubactions.enum.whatsappWithin24Hours,
    targetMode: input.targetMode ?? "channel",
    sendRatePerMinute: input.sendRatePerMinute ?? null,
  })
  return id
}

const schedule = async (workspaceId: string, broadcastId: string) =>
  await broadcastService.scheduleDraft({
    workspaceId,
    broadcastId,
    schedulesType: "now",
    schedulesAt: new Date(),
  })

const waitForBroadcastLockWaiter = async (): Promise<void> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const result = await db.execute<{ pid: number }>(sql`
      SELECT pid
      FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
        AND query LIKE '%"Broadcast"%'
      LIMIT 1
    `)
    if (result.rows.length > 0) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("Timed out waiting for scheduleDraft to block on Broadcast")
}

describe.skipIf(!databaseUrl)("broadcast activation concurrency", () => {
  beforeAll(async () => {
    await db.insert(userModel).values({
      id: ownerId,
      email: `broadcast-race-${ownerId}@example.test`,
      name: "Broadcast race owner",
    })
    await db.insert(userQuotaModel).values({
      userId: ownerId,
      planName: "Trial",
      planStatus: "trial",
      contactsUsed: 0,
      workspacesUsed: 0,
      channelsUsed: 0,
      teamMembersUsed: 0,
      macUsed: 0,
      botMessagesUsed: 0,
      monthlyBotMessagesUsed: 0,
      botMessagesTopUpGranted: 0,
      whiteLabel: false,
      ssoSaml: false,
      saasMode: false,
    })
    await db.insert(workspaceModel).values(
      workspaceIds.map((id, index) => ({
        id,
        ownerId,
        name: `Broadcast race workspace ${index + 1}`,
      })),
    )
    await db.insert(flowModel).values({
      id: flowId,
      workspaceId: workspaceIds[0],
      name: "Race flow",
    })
    mocks.workspaceFind.mockImplementation(
      async ({ where }: { where: { id?: string } }) =>
        workspaceIds.includes(where.id as (typeof workspaceIds)[number])
          ? { id: where.id, ownerId }
          : undefined,
    )
  })

  beforeEach(async () => {
    await db
      .delete(broadcastModel)
      .where(eq(broadcastModel.workspaceId, workspaceIds[0]))
    await db
      .delete(broadcastModel)
      .where(eq(broadcastModel.workspaceId, workspaceIds[1]))
    insertedBroadcastIds.clear()
  })

  afterAll(async () => {
    for (const id of insertedBroadcastIds) {
      await db.delete(broadcastModel).where(eq(broadcastModel.id, id))
    }
    await db.delete(flowModel).where(eq(flowModel.id, flowId))
    for (const id of workspaceIds) {
      await db.delete(workspaceModel).where(eq(workspaceModel.id, id))
    }
    await db.delete(userQuotaModel).where(eq(userQuotaModel.userId, ownerId))
    await db.delete(userModel).where(eq(userModel.id, ownerId))
  })

  test("allows exactly one of two concurrent Messenger activations", async () => {
    const firstId = await insertDraft({
      workspaceId: workspaceIds[0],
      channel: "messenger",
    })
    const secondId = await insertDraft({
      workspaceId: workspaceIds[0],
      channel: "messenger",
    })

    const results = await Promise.allSettled([
      schedule(workspaceIds[0], firstId),
      schedule(workspaceIds[0], secondId),
    ])

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1)
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1)
    const rows = await db.query.broadcastModel.findMany({
      where: { workspaceId: workspaceIds[0], status: "scheduled" },
      columns: { sendRatePerMinute: true },
    })
    expect(rows).toEqual([{ sendRatePerMinute: 60 }])
  })

  test("does not count a WhatsApp activation against the Messenger slot", async () => {
    const messengerId = await insertDraft({
      workspaceId: workspaceIds[0],
      channel: "messenger",
    })
    const whatsappId = await insertDraft({
      workspaceId: workspaceIds[0],
      channel: "whatsapp",
    })

    await expect(
      Promise.all([
        schedule(workspaceIds[0], messengerId),
        schedule(workspaceIds[0], whatsappId),
      ]),
    ).resolves.toHaveLength(2)
  })

  test("allows one Messenger activation in each workspace", async () => {
    const firstId = await insertDraft({
      workspaceId: workspaceIds[0],
      channel: "messenger",
    })
    const secondId = await insertDraft({
      workspaceId: workspaceIds[1],
      channel: "messenger",
    })

    await expect(
      Promise.all([
        schedule(workspaceIds[0], firstId),
        schedule(workspaceIds[1], secondId),
      ]),
    ).resolves.toHaveLength(2)
  })

  test("releases the advisory lock after a failed transaction", async () => {
    await expect(
      db.transaction(async (tx) => {
        await broadcastPlanPolicyService.lockActivation(tx, workspaceIds[0])
        throw new Error("rollback")
      }),
    ).rejects.toThrow("rollback")
    const id = await insertDraft({
      workspaceId: workspaceIds[0],
      channel: "messenger",
    })

    await expect(schedule(workspaceIds[0], id)).resolves.toEqual({ id })
  })

  test("reports empty targets before an occupied Messenger slot", async () => {
    const activeId = await insertDraft({
      workspaceId: workspaceIds[0],
      channel: "messenger",
    })
    await schedule(workspaceIds[0], activeId)
    const emptyTargetsId = await insertDraft({
      workspaceId: workspaceIds[0],
      channel: "messenger",
      targetMode: "targets",
    })

    await expect(
      schedule(workspaceIds[0], emptyTargetsId),
    ).rejects.toMatchObject({
      field: "targets",
      message: "Select a template or flow for at least one page",
    })

    const row = await db.query.broadcastModel.findFirst({
      where: { id: emptyTargetsId },
      columns: { status: true },
    })
    expect(row).toMatchObject({ status: "draft" })
  })

  test.each([
    ["schedule-first", true],
    ["save-first", false],
  ] as const)("%s schedule/save race never schedules an unchecked rate", async (_label, scheduleFirst) => {
    const id = await insertDraft({
      workspaceId: workspaceIds[0],
      channel: "messenger",
    })
    const save = () =>
      broadcastService.updateDraft({
        workspaceId: workspaceIds[0],
        broadcastId: id,
        canViewEmailAndPhone: true,
        data: {
          channel: "messenger",
          flowId,
          subaction: broadcastSubactions.enum.messengerActiveContacts,
          schedulesType: "now",
          schedulesAt: null,
          saveAsDraft: true,
          sendRatePerMinute: 30,
        },
      })

    if (!scheduleFirst) {
      const holderLocked = Promise.withResolvers<void>()
      const releaseHolder = Promise.withResolvers<void>()
      const holder = db.transaction(async (tx) => {
        await tx
          .select({ id: broadcastModel.id })
          .from(broadcastModel)
          .where(eq(broadcastModel.id, id))
          .for("update")
        holderLocked.resolve()
        await releaseHolder.promise
      })
      await holderLocked.promise

      const savePromise = save()
      try {
        await waitForBroadcastLockWaiter()
      } catch (error) {
        releaseHolder.resolve()
        await holder
        await Promise.allSettled([savePromise])
        throw error
      }

      const schedulePromise = schedule(workspaceIds[0], id)
      releaseHolder.resolve()
      await holder

      await expect(savePromise).resolves.toEqual({ id, status: "draft" })
      await expect(schedulePromise).resolves.toEqual({ id })

      const row = await db.query.broadcastModel.findFirst({
        where: { id },
        columns: { status: true, sendRatePerMinute: true },
      })
      expect(row).toMatchObject({
        status: "scheduled",
        sendRatePerMinute: 30,
      })
      return
    }

    const holderLocked = Promise.withResolvers<void>()
    const releaseHolder = Promise.withResolvers<void>()
    const holder = db.transaction(async (tx) => {
      await tx
        .select({ id: broadcastModel.id })
        .from(broadcastModel)
        .where(eq(broadcastModel.id, id))
        .for("update")
      holderLocked.resolve()
      await releaseHolder.promise
    })
    await holderLocked.promise

    const schedulePromise = schedule(workspaceIds[0], id)
    try {
      await waitForBroadcastLockWaiter()
    } catch (error) {
      releaseHolder.resolve()
      await holder
      await Promise.allSettled([schedulePromise])
      throw error
    }

    const saveAssertion = expect(save()).rejects.toThrow(
      "Broadcast is not a draft",
    )
    releaseHolder.resolve()
    await holder

    await expect(schedulePromise).resolves.toEqual({ id })
    await saveAssertion

    const row = await db.query.broadcastModel.findFirst({
      where: { id },
      columns: { status: true, sendRatePerMinute: true },
    })
    expect(row).toMatchObject({
      status: "scheduled",
      sendRatePerMinute: 60,
    })
  })
})
