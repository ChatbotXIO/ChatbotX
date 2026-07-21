import { beforeEach, describe, expect, test, vi } from "vitest"

// ── db spies ──────────────────────────────────────────────────────────────────
const findManyBroadcast = vi.fn()
const findManyContactsOnBroadcasts = vi.fn()
const updateWhereSpy = vi.fn()

type UpdateCall = {
  table: unknown
  values: Record<string, unknown>
  condition: unknown
}
const updateCalls: UpdateCall[] = []

// ── queue spies ───────────────────────────────────────────────────────────────
const chatAddSpy = vi.fn()
const integrationAddSpy = vi.fn()
const scheduleAddSpy = vi.fn()

// ── logger spy ────────────────────────────────────────────────────────────────
const loggerErrorSpy = vi.fn()

// ── mocks ─────────────────────────────────────────────────────────────────────
vi.mock("@chatbotx.io/business", () => ({
  withBlockedOwnerGuard: async (
    _workspaceId: unknown,
    fn: () => Promise<unknown>,
  ) => fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      broadcastModel: {
        findMany: (...args: unknown[]) => findManyBroadcast(...args),
      },
      contactsOnBroadcastsModel: {
        findMany: (...args: unknown[]) => findManyContactsOnBroadcasts(...args),
      },
    },
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: unknown) => {
          updateCalls.push({ table, values, condition })
          return updateWhereSpy()
        },
      }),
    }),
  },
  and: (...args: unknown[]) => ({ __and: args }),
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    __sql: { strings: [...strings], values },
  }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: { id: "broadcast.id", __name: "broadcastModel" },
  contactsOnBroadcastsModel: {
    broadcastId: "cob.broadcastId",
    contactId: "cob.contactId",
    failedAt: "cob.failedAt",
    errorContent: "cob.errorContent",
    __name: "contactsOnBroadcastsModel",
  },
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  broadcastStatuses: {
    enum: { scheduled: "scheduled", sending: "sending", sent: "sent" },
  },
  channelTypes: {
    enum: {
      omnichannel: "omnichannel",
      whatsapp: "whatsapp",
      messenger: "messenger",
      instagram: "instagram",
      telegram: "telegram",
      tiktok: "tiktok",
    },
  },
}))

vi.mock("@chatbotx.io/flow-config", () => ({
  BROADCAST_PAYLOAD_TYPE: "broadcast",
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  chatQueue: {
    add: (...args: unknown[]) => chatAddSpy(...args),
  },
  integrationQueue: {
    add: (...args: unknown[]) => integrationAddSpy(...args),
  },
  ChatJobAction: {
    sendWhatsappTemplateMessage: "sendWhatsappTemplateMessage",
    sendMessengerTemplateMessage: "sendMessengerTemplateMessage",
  },
  IntegrationJobAction: {
    sendFlow: "sendFlow",
  },
  ScheduleJobData: {
    sendBroadcast: "sendBroadcast",
  },
  scheduleQueue: {
    add: (...args: unknown[]) => scheduleAddSpy(...args),
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: (...args: unknown[]) => loggerErrorSpy(...args),
  },
}))

const { processBroadcastContacts } = await import(
  "../src/schedule/handlers/process-broadcast-contacts"
)

// ── helpers ───────────────────────────────────────────────────────────────────
const BROADCAST_ID = "broadcast-1"
const WORKSPACE_ID = "workspace-1"

const makeConversation = (id = "conv-1", contactId = "contact-1") => ({
  id,
  contactId,
  workspaceId: WORKSPACE_ID,
})

const makeContactInbox = (id = "ci-1") => ({ id })

const makeContactOnBroadcast = (overrides: Record<string, unknown> = {}) => ({
  broadcastId: BROADCAST_ID,
  contactId: "contact-1",
  contactInboxId: "ci-1",
  conversationId: "conv-1",
  sent: false,
  conversation: makeConversation(),
  contactInbox: makeContactInbox(),
  ...overrides,
})

const makeBroadcast = (overrides: Record<string, unknown> = {}) => ({
  id: BROADCAST_ID,
  workspaceId: WORKSPACE_ID,
  status: "sending",
  flowId: null as string | null,
  templateId: null as string | null,
  channel: null as string | null,
  templateData: null as unknown,
  ...overrides,
})

// ── setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  updateCalls.length = 0
  vi.clearAllMocks()
  findManyBroadcast.mockResolvedValue([])
  findManyContactsOnBroadcasts.mockResolvedValue([])
  updateWhereSpy.mockResolvedValue(undefined)
  chatAddSpy.mockResolvedValue(undefined)
  integrationAddSpy.mockResolvedValue(undefined)
  scheduleAddSpy.mockResolvedValue(undefined)
})

// ── tests ─────────────────────────────────────────────────────────────────────
describe("processBroadcastContacts", () => {
  describe("no broadcasts in 'sending' status", () => {
    test("returns { processed: 0 } without any db updates or queue adds", async () => {
      findManyBroadcast.mockResolvedValue([])

      const result = await processBroadcastContacts(BROADCAST_ID)

      expect(result).toEqual({ processed: 0 })
      expect(updateCalls).toHaveLength(0)
      expect(chatAddSpy).not.toHaveBeenCalled()
      expect(integrationAddSpy).not.toHaveBeenCalled()
    })
  })

  describe("broadcast has no unsent contacts", () => {
    test("updates broadcastModel status to 'sent' and returns processed: 0", async () => {
      findManyBroadcast.mockResolvedValue([makeBroadcast()])
      findManyContactsOnBroadcasts.mockResolvedValue([])

      const result = await processBroadcastContacts(BROADCAST_ID)

      expect(result).toEqual({ processed: 0 })
      expect(updateCalls).toHaveLength(1)
      expect(updateCalls[0].values).toMatchObject({ status: "sent" })
      expect(chatAddSpy).not.toHaveBeenCalled()
    })
  })

  describe("broadcast with flowId", () => {
    test("enqueues integrationQueue sendFlow with correct payload", async () => {
      findManyBroadcast.mockResolvedValue([makeBroadcast({ flowId: "flow-1" })])
      findManyContactsOnBroadcasts.mockResolvedValue([makeContactOnBroadcast()])

      await processBroadcastContacts(BROADCAST_ID)

      expect(integrationAddSpy).toHaveBeenCalledTimes(1)
      expect(integrationAddSpy).toHaveBeenCalledWith(
        "sendFlow",
        expect.objectContaining({
          type: "sendFlow",
          data: expect.objectContaining({
            flowId: "flow-1",
            conversationId: "conv-1",
            contactInboxId: "ci-1",
            metadata: expect.objectContaining({
              type: "broadcast",
              broadcastId: BROADCAST_ID,
            }),
          }),
        }),
        {
          jobId: "broadcast-send-contact-broadcast-1-contact-1-flow",
          removeOnComplete: { age: 3600, count: 100_000 },
        },
      )
    })

    test("does not call chatQueue when only flowId is set", async () => {
      findManyBroadcast.mockResolvedValue([makeBroadcast({ flowId: "flow-1" })])
      findManyContactsOnBroadcasts.mockResolvedValue([makeContactOnBroadcast()])

      await processBroadcastContacts(BROADCAST_ID)

      expect(chatAddSpy).not.toHaveBeenCalled()
    })

    test.each([
      "instagram",
      "telegram",
      "tiktok",
    ] as const)("enqueues %s flow broadcasts through the integration queue only", async (channel) => {
      findManyBroadcast.mockResolvedValue([
        makeBroadcast({ flowId: "flow-1", channel }),
      ])
      findManyContactsOnBroadcasts.mockResolvedValue([makeContactOnBroadcast()])

      await processBroadcastContacts(BROADCAST_ID)

      expect(integrationAddSpy).toHaveBeenCalledWith(
        "sendFlow",
        expect.objectContaining({
          type: "sendFlow",
          data: expect.objectContaining({
            flowId: "flow-1",
            contactInboxId: "ci-1",
          }),
        }),
        expect.any(Object),
      )
      expect(chatAddSpy).not.toHaveBeenCalled()
    })
  })

  describe("broadcast with templateId on non-messenger channel", () => {
    test("enqueues chatQueue sendWhatsappTemplateMessage with correct payload", async () => {
      findManyBroadcast.mockResolvedValue([
        makeBroadcast({
          templateId: "tmpl-1",
          channel: "whatsapp",
          templateData: { components: [] },
        }),
      ])
      findManyContactsOnBroadcasts.mockResolvedValue([makeContactOnBroadcast()])

      await processBroadcastContacts(BROADCAST_ID)

      expect(chatAddSpy).toHaveBeenCalledTimes(1)
      expect(chatAddSpy).toHaveBeenCalledWith(
        "sendWhatsappTemplateMessage",
        expect.objectContaining({
          type: "sendWhatsappTemplateMessage",
          data: expect.objectContaining({
            templateId: "tmpl-1",
            broadcastId: BROADCAST_ID,
            templateData: { components: [] },
            metadata: expect.objectContaining({
              type: "broadcast",
              broadcastId: BROADCAST_ID,
            }),
          }),
        }),
        {
          jobId: "broadcast-send-contact-broadcast-1-contact-1-template",
          removeOnComplete: { age: 3600, count: 100_000 },
        },
      )
    })
  })

  describe("broadcast with templateId on messenger channel", () => {
    test("enqueues chatQueue sendMessengerTemplateMessage", async () => {
      findManyBroadcast.mockResolvedValue([
        makeBroadcast({
          templateId: "tmpl-messenger",
          channel: "messenger",
          templateData: { text: "Hello" },
        }),
      ])
      findManyContactsOnBroadcasts.mockResolvedValue([makeContactOnBroadcast()])

      await processBroadcastContacts(BROADCAST_ID)

      expect(chatAddSpy).toHaveBeenCalledTimes(1)
      expect(chatAddSpy).toHaveBeenCalledWith(
        "sendMessengerTemplateMessage",
        expect.objectContaining({ type: "sendMessengerTemplateMessage" }),
        {
          jobId: "broadcast-send-contact-broadcast-1-contact-1-template",
          removeOnComplete: { age: 3600, count: 100_000 },
        },
      )
    })

    test("separates buttons from templateData so job receives correct shapes", async () => {
      const buttons = [{ id: "b1", label: "Yes", flowId: "flow-btn" }]
      findManyBroadcast.mockResolvedValue([
        makeBroadcast({
          templateId: "tmpl-messenger",
          channel: "messenger",
          templateData: { text: "Pick one", buttons },
        }),
      ])
      findManyContactsOnBroadcasts.mockResolvedValue([makeContactOnBroadcast()])

      await processBroadcastContacts(BROADCAST_ID)

      const callArgs = chatAddSpy.mock.calls[0] as [
        string,
        { data: { templateData: unknown; buttons: unknown } },
      ]
      const { data } = callArgs[1]
      expect(data.buttons).toEqual(buttons)
      expect(data.templateData).toEqual({ text: "Pick one" })
    })

    test("templateData is undefined when no non-button fields are present", async () => {
      findManyBroadcast.mockResolvedValue([
        makeBroadcast({
          templateId: "tmpl-messenger",
          channel: "messenger",
          templateData: { buttons: [{ id: "b1", label: "Yes" }] },
        }),
      ])
      findManyContactsOnBroadcasts.mockResolvedValue([makeContactOnBroadcast()])

      await processBroadcastContacts(BROADCAST_ID)

      const callArgs = chatAddSpy.mock.calls[0] as [
        string,
        { data: { templateData: unknown } },
      ]
      expect(callArgs[1].data.templateData).toBeUndefined()
    })
  })

  describe("successful contact processing", () => {
    test("scopes broadcast lookup when broadcastId is provided", async () => {
      findManyBroadcast.mockResolvedValue([])

      await processBroadcastContacts("broadcast-filter")

      expect(findManyBroadcast).toHaveBeenCalledWith({
        where: {
          id: "broadcast-filter",
          status: "sending",
        },
      })
    })

    test("fetches only unsent contacts that are not terminal-failed", async () => {
      findManyBroadcast.mockResolvedValue([makeBroadcast()])

      await processBroadcastContacts(BROADCAST_ID)

      expect(findManyContactsOnBroadcasts).toHaveBeenCalledWith({
        where: {
          broadcastId: BROADCAST_ID,
          sent: false,
          failedAt: { isNull: true },
        },
        with: {
          conversation: true,
          contactInbox: true,
        },
        limit: 500,
      })
    })

    test("marks contactOnBroadcast as sent=true after queue add", async () => {
      findManyBroadcast.mockResolvedValue([
        makeBroadcast({ templateId: "tmpl-1", channel: "whatsapp" }),
      ])
      findManyContactsOnBroadcasts.mockResolvedValue([makeContactOnBroadcast()])

      const result = await processBroadcastContacts(BROADCAST_ID)

      expect(result).toEqual({ processed: 1 })
      // update to contactsOnBroadcastsModel
      const cobUpdate = updateCalls.find(
        (c) =>
          (c.table as { __name?: string }).__name ===
          "contactsOnBroadcastsModel",
      )
      expect(cobUpdate).toBeDefined()
      expect(cobUpdate?.values).toMatchObject({ sent: true })
      expect(cobUpdate?.condition).toEqual({
        __and: [
          { __eq: ["cob.broadcastId", BROADCAST_ID] },
          { __eq: ["cob.contactId", "contact-1"] },
        ],
      })
    })

    test("processes multiple contacts in the scoped broadcast and returns total count", async () => {
      findManyBroadcast.mockResolvedValue([
        makeBroadcast({ templateId: "t-1", channel: "whatsapp" }),
      ])
      findManyContactsOnBroadcasts.mockResolvedValue([
        makeContactOnBroadcast(),
        makeContactOnBroadcast({
          contactId: "contact-2",
          contactInboxId: "ci-2",
        }),
        makeContactOnBroadcast({
          contactId: "contact-3",
          contactInboxId: "ci-3",
        }),
      ])

      const result = await processBroadcastContacts(BROADCAST_ID)

      expect(result).toEqual({ processed: 3 })
    })

    test("does not requeue or finalize on full batch because cron drives the next batch", async () => {
      findManyBroadcast.mockResolvedValue([
        makeBroadcast({ templateId: "tmpl-1", channel: "whatsapp" }),
      ])
      findManyContactsOnBroadcasts.mockResolvedValue(
        Array.from({ length: 500 }, (_, index) =>
          makeContactOnBroadcast({
            contactId: `contact-${index}`,
            contactInboxId: `ci-${index}`,
          }),
        ),
      )

      const result = await processBroadcastContacts(BROADCAST_ID)

      expect(result).toEqual({ processed: 500 })
      expect(scheduleAddSpy).not.toHaveBeenCalled()
      expect(
        updateCalls.some(
          (call) =>
            (call.table as { __name?: string }).__name === "broadcastModel" &&
            call.values.status === "sent",
        ),
      ).toBe(false)
    })

    test("marks broadcast sent for a partial batch with no retryable error", async () => {
      findManyBroadcast.mockResolvedValue([
        makeBroadcast({ templateId: "tmpl-1", channel: "whatsapp" }),
      ])
      findManyContactsOnBroadcasts.mockResolvedValue([makeContactOnBroadcast()])

      await processBroadcastContacts(BROADCAST_ID)

      expect(scheduleAddSpy).not.toHaveBeenCalled()
      expect(
        updateCalls.some(
          (call) =>
            (call.table as { __name?: string }).__name === "broadcastModel" &&
            call.values.status === "sent",
        ),
      ).toBe(true)
    })
  })

  describe("error handling inside per-contact processing", () => {
    test("throws when queue.add fails so BullMQ can retry and does not mark failedAt", async () => {
      findManyBroadcast.mockResolvedValue([
        makeBroadcast({ templateId: "tmpl-1", channel: "whatsapp" }),
      ])
      findManyContactsOnBroadcasts.mockResolvedValue([makeContactOnBroadcast()])

      const error = new Error("queue unavailable")
      chatAddSpy.mockRejectedValueOnce(error)

      await expect(processBroadcastContacts(BROADCAST_ID)).rejects.toThrow(
        "queue unavailable",
      )

      expect(loggerErrorSpy).toHaveBeenCalledTimes(1)
      expect(updateCalls).not.toContainEqual(
        expect.objectContaining({
          values: expect.objectContaining({ failedAt: expect.anything() }),
        }),
      )
    })

    test("throws when sent=true update fails after enqueue and does not mark failedAt", async () => {
      findManyBroadcast.mockResolvedValue([
        makeBroadcast({ templateId: "tmpl-1", channel: "whatsapp" }),
      ])
      findManyContactsOnBroadcasts.mockResolvedValue([makeContactOnBroadcast()])

      updateWhereSpy.mockRejectedValueOnce(new Error("database unavailable"))

      await expect(processBroadcastContacts(BROADCAST_ID)).rejects.toThrow(
        "database unavailable",
      )

      expect(chatAddSpy).toHaveBeenCalledTimes(1)
      expect(updateCalls).not.toContainEqual(
        expect.objectContaining({
          values: expect.objectContaining({ failedAt: expect.anything() }),
        }),
      )
    })

    test("marks invalid flow contact failed without throwing or enqueueing", async () => {
      findManyBroadcast.mockResolvedValue([makeBroadcast({ flowId: "flow-1" })])
      findManyContactsOnBroadcasts.mockResolvedValue([
        makeContactOnBroadcast({ conversationId: "" }),
      ])

      const result = await processBroadcastContacts(BROADCAST_ID)

      expect(result).toEqual({ processed: 0 })
      expect(integrationAddSpy).not.toHaveBeenCalled()
      expect(updateCalls).toContainEqual(
        expect.objectContaining({
          values: expect.objectContaining({
            failedAt: expect.anything(),
            errorContent: "missing conversation for flow send",
          }),
        }),
      )
    })

    test("marks invalid template contact failed without throwing or enqueueing", async () => {
      findManyBroadcast.mockResolvedValue([
        makeBroadcast({ templateId: "tmpl-1", channel: "whatsapp" }),
      ])
      findManyContactsOnBroadcasts.mockResolvedValue([
        makeContactOnBroadcast({ conversation: null }),
      ])

      const result = await processBroadcastContacts(BROADCAST_ID)

      expect(result).toEqual({ processed: 0 })
      expect(chatAddSpy).not.toHaveBeenCalled()
      expect(updateCalls).toContainEqual(
        expect.objectContaining({
          values: expect.objectContaining({
            failedAt: expect.anything(),
            errorContent: "missing conversation/contactInbox for template send",
          }),
        }),
      )
    })

    test("throws when marking invalid contact failed hits a database error", async () => {
      findManyBroadcast.mockResolvedValue([makeBroadcast({ flowId: "flow-1" })])
      findManyContactsOnBroadcasts.mockResolvedValue([
        makeContactOnBroadcast({ conversationId: "" }),
      ])
      updateWhereSpy.mockRejectedValueOnce(new Error("database unavailable"))

      await expect(processBroadcastContacts(BROADCAST_ID)).rejects.toThrow(
        "database unavailable",
      )

      expect(integrationAddSpy).not.toHaveBeenCalled()
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.any(Error),
          contactOnBroadcast: expect.objectContaining({ conversationId: "" }),
        }),
        "Retryable error sending broadcast contact",
      )
    })

    test("enqueues flow and template with distinct deterministic jobIds", async () => {
      findManyBroadcast.mockResolvedValue([
        makeBroadcast({
          flowId: "flow-1",
          templateId: "tmpl-1",
          channel: "whatsapp",
        }),
      ])
      findManyContactsOnBroadcasts.mockResolvedValue([makeContactOnBroadcast()])

      await processBroadcastContacts(BROADCAST_ID)

      expect(integrationAddSpy).toHaveBeenCalledWith(
        "sendFlow",
        expect.anything(),
        {
          jobId: "broadcast-send-contact-broadcast-1-contact-1-flow",
          removeOnComplete: { age: 3600, count: 100_000 },
        },
      )
      expect(chatAddSpy).toHaveBeenCalledWith(
        "sendWhatsappTemplateMessage",
        expect.anything(),
        {
          jobId: "broadcast-send-contact-broadcast-1-contact-1-template",
          removeOnComplete: { age: 3600, count: 100_000 },
        },
      )
    })

    test("retries both flow and template with the same deterministic jobIds", async () => {
      findManyBroadcast.mockResolvedValue([
        makeBroadcast({
          flowId: "flow-1",
          templateId: "tmpl-1",
          channel: "whatsapp",
        }),
      ])
      findManyContactsOnBroadcasts.mockResolvedValue([makeContactOnBroadcast()])
      updateWhereSpy
        .mockRejectedValueOnce(new Error("database unavailable"))
        .mockResolvedValue(undefined)

      await expect(processBroadcastContacts(BROADCAST_ID)).rejects.toThrow(
        "database unavailable",
      )
      await processBroadcastContacts(BROADCAST_ID)

      expect(integrationAddSpy).toHaveBeenCalledTimes(2)
      expect(chatAddSpy).toHaveBeenCalledTimes(2)
      expect(integrationAddSpy.mock.calls.map((call) => call[2])).toEqual([
        {
          jobId: "broadcast-send-contact-broadcast-1-contact-1-flow",
          removeOnComplete: { age: 3600, count: 100_000 },
        },
        {
          jobId: "broadcast-send-contact-broadcast-1-contact-1-flow",
          removeOnComplete: { age: 3600, count: 100_000 },
        },
      ])
      expect(chatAddSpy.mock.calls.map((call) => call[2])).toEqual([
        {
          jobId: "broadcast-send-contact-broadcast-1-contact-1-template",
          removeOnComplete: { age: 3600, count: 100_000 },
        },
        {
          jobId: "broadcast-send-contact-broadcast-1-contact-1-template",
          removeOnComplete: { age: 3600, count: 100_000 },
        },
      ])
    })

    test("never emits a downstream jobId containing ':' (BullMQ rejects it)", async () => {
      findManyBroadcast.mockResolvedValue([
        makeBroadcast({
          flowId: "flow-1",
          templateId: "tmpl-1",
          channel: "whatsapp",
        }),
      ])
      findManyContactsOnBroadcasts.mockResolvedValue([makeContactOnBroadcast()])

      await processBroadcastContacts(BROADCAST_ID)

      const jobIds = [
        ...integrationAddSpy.mock.calls,
        ...chatAddSpy.mock.calls,
      ].map((call) => (call[2] as { jobId: string }).jobId)

      expect(jobIds.length).toBeGreaterThan(0)
      for (const jobId of jobIds) {
        expect(jobId).not.toContain(":")
      }
    })
  })
})
