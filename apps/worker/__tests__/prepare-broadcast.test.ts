import { beforeEach, describe, expect, test, vi } from "vitest"

// ── db spies ──────────────────────────────────────────────────────────────────
const findFirstBroadcast = vi.fn()
const findManyInbox = vi.fn()
const findManyConversation = vi.fn()

type UpdateCall = {
  table: unknown
  values: Record<string, unknown>
  condition: unknown
}
const updateCalls: UpdateCall[] = []

type InsertCall = { table: unknown; values: unknown }
const insertCalls: InsertCall[] = []

const onConflictSpy = vi.fn()

// ── audience where capture (for contactFilter wiring assertion) ────────────────
const audienceWhereCalls: unknown[] = []

// ── queue spy ─────────────────────────────────────────────────────────────────
const scheduleAddSpy = vi.fn()

// ── chunkById spy – controls whether callback is invoked ──────────────────────
const chunkByIdMock = vi.fn()

// ── mocks ─────────────────────────────────────────────────────────────────────
vi.mock("@chatbotx.io/database/partials", async () =>
  vi.importActual("@chatbotx.io/database/partials"),
)

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: { id: "Broadcast.id", __name: "broadcastModel" },
  contactInboxModel: {
    id: "ContactInbox.id",
    inboxId: "ContactInbox.inboxId",
    contactId: "ContactInbox.contactId",
    __name: "contactInboxModel",
  },
  contactsOnBroadcastsModel: { __name: "contactsOnBroadcastsModel" },
}))

vi.mock("@chatbotx.io/database/queries", () => ({
  buildContactInboxContactFilterSQL: vi.fn(() => ({ RAW: "contact-filter" })),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      broadcastModel: {
        findFirst: (...args: unknown[]) => findFirstBroadcast(...args),
      },
      inboxModel: {
        findMany: (...args: unknown[]) => findManyInbox(...args),
      },
      conversationModel: {
        findMany: (...args: unknown[]) => findManyConversation(...args),
      },
    },
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: unknown) => {
          updateCalls.push({ table, values, condition })
          return Promise.resolve()
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (vals: unknown) => {
        insertCalls.push({ table, values: vals })
        return {
          onConflictDoNothing: () => {
            onConflictSpy()
            return Promise.resolve()
          },
        }
      },
    }),
    select: () => ({
      from: () => ({
        where: (where: unknown) => {
          audienceWhereCalls.push(where)
          return {
            orderBy: () => ({
              limit: () => Promise.resolve([]),
            }),
          }
        },
      }),
    }),
  },
  and: (...args: unknown[]) => ({ __and: args }),
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
  gt: (a: unknown, b: unknown) => ({ __gt: [a, b] }),
  inArray: (a: unknown, b: unknown) => ({ __inArray: [a, b] }),
  asc: (a: unknown) => ({ __asc: a }),
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  chunkById: (...args: unknown[]) => chunkByIdMock(...args),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  broadcastSendJobId: (broadcastId: string) => `broadcast-send-${broadcastId}`,
  scheduleQueue: {
    add: (...args: unknown[]) => scheduleAddSpy(...args),
  },
  ScheduleJobData: {
    sendBroadcast: "sendBroadcast",
    prepareBroadcast: "prepareBroadcast",
    enqueueBroadcast: "enqueueBroadcast",
    finalizeBroadcasts: "finalizeBroadcasts",
  },
}))

const { prepareBroadcast } = await import(
  "../src/schedule/handlers/prepare-broadcast"
)

// ── helpers ───────────────────────────────────────────────────────────────────
const BROADCAST_ID = "broadcast-1"
const WORKSPACE_ID = "workspace-1"

const baseBroadcast = () => ({
  id: BROADCAST_ID,
  workspaceId: WORKSPACE_ID,
  integrationWhatsappId: null as string | null,
  integrationWhatsapp: null as { inboxId: string } | null,
  channel: null as string | null,
  status: "scheduled",
  contactFilter: null as unknown,
})

const hasKeyDeep = (value: unknown, keys: Set<string>): boolean => {
  if (!value || typeof value !== "object") {
    return false
  }
  return Object.entries(value).some(
    ([key, child]) => keys.has(key) || hasKeyDeep(child, keys),
  )
}

// ── setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  updateCalls.length = 0
  insertCalls.length = 0
  audienceWhereCalls.length = 0
  findFirstBroadcast.mockResolvedValue(undefined)
  findManyInbox.mockResolvedValue([])
  findManyConversation.mockResolvedValue([])
  chunkByIdMock.mockResolvedValue(undefined)
})

// ── tests ─────────────────────────────────────────────────────────────────────
describe("prepareBroadcast", () => {
  describe("broadcast not found", () => {
    test("returns without any db writes or queue enqueues", async () => {
      findFirstBroadcast.mockResolvedValue(undefined)

      await prepareBroadcast(BROADCAST_ID)

      expect(updateCalls).toHaveLength(0)
      expect(insertCalls).toHaveLength(0)
      expect(scheduleAddSpy).not.toHaveBeenCalled()
    })
  })

  describe("integrationWhatsappId + integrationWhatsapp present", () => {
    test("uses integrationWhatsapp.inboxId directly and skips inboxModel query", async () => {
      findFirstBroadcast.mockResolvedValue({
        ...baseBroadcast(),
        integrationWhatsappId: "wa-int-1",
        integrationWhatsapp: { inboxId: "inbox-wa" },
      })
      // no contacts → status sent
      chunkByIdMock.mockResolvedValue(undefined)

      await prepareBroadcast(BROADCAST_ID)

      expect(findManyInbox).not.toHaveBeenCalled()
      // inboxIds = ["inbox-wa"], not empty, so chunkById is called
      expect(chunkByIdMock).toHaveBeenCalledTimes(1)
    })
  })

  describe("inbox resolution via inboxModel", () => {
    test("omnichannel channel → no channel key in where clause", async () => {
      findFirstBroadcast.mockResolvedValue({
        ...baseBroadcast(),
        channel: "omnichannel",
      })
      findManyInbox.mockResolvedValue([{ id: "inbox-1" }])

      await prepareBroadcast(BROADCAST_ID)

      expect(findManyInbox).toHaveBeenCalledTimes(1)
      const [arg] = findManyInbox.mock.calls[0] as [
        { where: Record<string, unknown> },
      ]
      expect(arg.where).not.toHaveProperty("channel")
    })

    test("specific channel → channel key included in where clause", async () => {
      findFirstBroadcast.mockResolvedValue({
        ...baseBroadcast(),
        channel: "whatsapp",
      })
      findManyInbox.mockResolvedValue([{ id: "inbox-1" }])

      await prepareBroadcast(BROADCAST_ID)

      const [arg] = findManyInbox.mock.calls[0] as [
        { where: Record<string, unknown> },
      ]
      expect(arg.where).toHaveProperty("channel", "whatsapp")
    })

    test("null channel → no channel key in where clause", async () => {
      findFirstBroadcast.mockResolvedValue({
        ...baseBroadcast(),
        channel: null,
      })
      findManyInbox.mockResolvedValue([{ id: "inbox-1" }])

      await prepareBroadcast(BROADCAST_ID)

      const [arg] = findManyInbox.mock.calls[0] as [
        { where: Record<string, unknown> },
      ]
      expect(arg.where).not.toHaveProperty("channel")
    })
  })

  describe("inboxIds resolves to empty list", () => {
    test("updates broadcast status to 'sent' and returns early without calling chunkById", async () => {
      findFirstBroadcast.mockResolvedValue(baseBroadcast())
      findManyInbox.mockResolvedValue([])

      await prepareBroadcast(BROADCAST_ID)

      expect(updateCalls).toHaveLength(1)
      expect(updateCalls[0].values).toMatchObject({ status: "sent" })
      expect(chunkByIdMock).not.toHaveBeenCalled()
      expect(scheduleAddSpy).not.toHaveBeenCalled()
    })
  })

  describe("contacts are found (chunkById invokes callback)", () => {
    type FakeContactInbox = { id: string; contactId: string }

    beforeEach(() => {
      findFirstBroadcast.mockResolvedValue({
        ...baseBroadcast(),
        channel: "whatsapp",
      })
      findManyInbox.mockResolvedValue([{ id: "inbox-1" }])
      findManyConversation.mockResolvedValue([
        { id: "conv-1", contactId: "contact-1" },
      ])
      chunkByIdMock.mockImplementation(
        async (
          _queryFn: unknown,
          opts: {
            callback: (
              items: FakeContactInbox[],
            ) => Promise<boolean | undefined>
          },
        ) => {
          await opts.callback([{ id: "ci-1", contactId: "contact-1" }])
        },
      )
    })

    test("inserts a contactsOnBroadcasts row with correct shape", async () => {
      await prepareBroadcast(BROADCAST_ID)

      expect(insertCalls).toHaveLength(1)
      expect(onConflictSpy).toHaveBeenCalledTimes(1)
      const rows = insertCalls[0].values as Record<string, unknown>[]
      expect(rows).toHaveLength(1)
      expect(Object.keys(rows[0]).sort()).toEqual(
        ["broadcastId", "contactId", "contactInboxId", "conversationId"].sort(),
      )
      expect(rows[0]).toEqual({
        broadcastId: BROADCAST_ID,
        contactId: "contact-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
      })
    })

    test("updates broadcast to status 'sending' with correct contactCount", async () => {
      await prepareBroadcast(BROADCAST_ID)

      expect(updateCalls).toHaveLength(1)
      expect(updateCalls[0].values).toMatchObject({
        status: "sending",
        contactCount: 1,
      })
    })

    test("enqueues sendBroadcast job in scheduleQueue", async () => {
      await prepareBroadcast(BROADCAST_ID)

      expect(scheduleAddSpy).toHaveBeenCalledTimes(1)
      expect(scheduleAddSpy).toHaveBeenCalledWith(
        "sendBroadcast",
        expect.objectContaining({
          type: "sendBroadcast",
          data: { broadcastId: BROADCAST_ID },
        }),
        {
          jobId: `broadcast-send-${BROADCAST_ID}`,
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: true,
        },
      )
    })

    test("maps conversationId from conversationMap or empty string when missing", async () => {
      // contactId "contact-2" has no matching conversation → conversationId = ""
      chunkByIdMock.mockImplementation(
        async (
          _queryFn: unknown,
          opts: {
            callback: (
              items: FakeContactInbox[],
            ) => Promise<boolean | undefined>
          },
        ) => {
          await opts.callback([
            { id: "ci-1", contactId: "contact-1" },
            { id: "ci-2", contactId: "contact-2" },
          ])
        },
      )

      await prepareBroadcast(BROADCAST_ID)

      const rows = insertCalls[0].values as Record<string, unknown>[]
      expect(rows).toHaveLength(2)
      expect(rows[0]).toMatchObject({ conversationId: "conv-1" })
      expect(rows[1]).toMatchObject({ conversationId: "" })
    })
  })

  describe("no contacts found (chunkById never invokes callback)", () => {
    beforeEach(() => {
      findFirstBroadcast.mockResolvedValue({
        ...baseBroadcast(),
        channel: "whatsapp",
      })
      findManyInbox.mockResolvedValue([{ id: "inbox-1" }])
      chunkByIdMock.mockResolvedValue(undefined)
    })

    test("updates broadcast to status 'sent' with contactCount 0", async () => {
      await prepareBroadcast(BROADCAST_ID)

      expect(updateCalls).toHaveLength(1)
      expect(updateCalls[0].values).toMatchObject({
        status: "sent",
        contactCount: 0,
      })
    })

    test("does not enqueue sendBroadcast job", async () => {
      await prepareBroadcast(BROADCAST_ID)

      expect(scheduleAddSpy).not.toHaveBeenCalled()
    })
  })

  describe("contactFilter wiring", () => {
    test("applies contactFilter to the inbox-rooted audience query", async () => {
      findFirstBroadcast.mockResolvedValue({
        ...baseBroadcast(),
        channel: "messenger",
        contactFilter: {
          operator: "and",
          conditions: [
            {
              field: "fullName",
              operator: "contains",
              value: "Ada",
            },
          ],
        },
      })
      findManyInbox.mockResolvedValue([{ id: "inbox-1" }])
      chunkByIdMock.mockResolvedValue(undefined)

      await prepareBroadcast(BROADCAST_ID)

      expect(audienceWhereCalls.length).toBeGreaterThan(0)
      const where = audienceWhereCalls[0]

      expect(where).toEqual(
        expect.objectContaining({
          __and: expect.arrayContaining([
            { __inArray: ["ContactInbox.inboxId", ["inbox-1"]] },
            { __gt: ["ContactInbox.id", expect.anything()] },
          ]),
        }),
      )
      expect(hasKeyDeep(where, new Set(["RAW", "contactId", "Contact"]))).toBe(
        true,
      )
    })
  })
})
