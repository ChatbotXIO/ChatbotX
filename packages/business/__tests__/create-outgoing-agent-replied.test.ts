// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockMarkAgentReplied = vi.fn()
const mockUpdateTracking = vi.fn()
const mockRepositoryCreate = vi.fn()
const mockChatQueueAdd = vi.fn()
const mockIntegrationQueueAdd = vi.fn()
const mockFlowExists = vi.fn()
const mockFindForAgent = vi.fn()
const mockWorkspaceFind = vi.fn()
const mockEmit = vi.fn()
const mockLoggerError = vi.fn()
const mockQueueMessageCreatedEvent = vi.fn()

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: async () => ({
    create: mockRepositoryCreate,
    createWithAttachments: vi.fn(),
  }),
  flowRepository: { existsInWorkspace: mockFlowExists },
  mediaLibraryFileRepository: { findByPath: vi.fn(), findById: vi.fn() },
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  guessFileTypeFromMimeType: vi.fn(() => "image"),
  pathJoin: (...parts: string[]) => parts.join("/"),
  uploader: { copyObject: vi.fn(), getPresignedDownload: vi.fn() },
  uploadMultipleFiles: vi.fn(async () => []),
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: () => "generated-id" }
})

vi.mock("@chatbotx.io/event-bus", () => ({ emit: mockEmit }))

vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: {
    sendChannelMessage: "sendChannelMessage",
    checkOutboundAutomatedResponse: "checkOutboundAutomatedResponse",
  },
  chatQueue: { add: mockChatQueueAdd },
  IntegrationJobAction: { sendFlow: "sendFlow" },
  integrationQueue: { add: mockIntegrationQueueAdd },
}))

vi.mock("../src/logger", () => ({
  logger: { error: mockLoggerError, warn: vi.fn(), info: vi.fn() },
}))

vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: { updateTracking: mockUpdateTracking },
}))

vi.mock("../src/conversation/service", () => ({
  conversationService: {
    markAgentReplied: mockMarkAgentReplied,
    findOrCreate: vi.fn(),
  },
}))

vi.mock("../src/workspace/service", () => ({
  workspaceService: { find: mockWorkspaceFind },
}))

vi.mock("../src/working-hours/service", () => ({
  workingHoursService: {
    findForAgent: mockFindForAgent,
    findDateOverridesFor: vi.fn(async () => new Map()),
  },
}))

vi.mock("../src/product-message/service", () => ({
  productMessageService: { prepareOutgoing: vi.fn() },
}))

vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: async () => ({ storageUrl: "https://s.example.com" }),
}))

vi.mock("../src/platform/realtime-broadcast", () => ({
  publishToWorkspaceParty: vi.fn(),
  queueMessageCreatedEvent: mockQueueMessageCreatedEvent,
}))

vi.mock("../src/utils", () => ({
  getPublicFileUrl: (path: string, base: string) => `${base}/${path}`,
}))

const { createOutgoing } = await import("../src/message/create-outgoing")

const conversation = { id: "conv-1", workspaceId: "ws-1", contactId: "c-1" }
const contactInbox = {
  id: "ci-1",
  inboxId: "inbox-1",
  contactId: "c-1",
  channel: "messenger",
}
const user = { id: "user-1" }

const awaitingSince = new Date("2026-10-19T02:00:00.000Z")
const claim = {
  closedAwaitingSince: awaitingSince,
  isFirstResponse: true,
  assignedUserId: null,
  assignedUserAt: null,
}

const sendText = (withUser = true) =>
  createOutgoing({
    conversation: conversation as never,
    contactInbox: contactInbox as never,
    input: { text: "hi" },
    user: withUser ? (user as never) : undefined,
  })

describe("createOutgoing agent:replied", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-19T02:05:00.000Z"))
    mockUpdateTracking.mockResolvedValue(null)
    mockRepositoryCreate.mockImplementation((input: { createdAt: Date }) =>
      Promise.resolve({ id: "msg-1", ...input, updatedAt: input.createdAt }),
    )
    mockChatQueueAdd.mockResolvedValue(undefined)
    mockIntegrationQueueAdd.mockResolvedValue(undefined)
    mockFlowExists.mockResolvedValue(true)
    mockMarkAgentReplied.mockResolvedValue(claim)
    mockFindForAgent.mockResolvedValue(null)
    mockWorkspaceFind.mockResolvedValue({ id: "ws-1", timezone: "UTC" })
  })

  test("emits once with seconds computed from the customer message", async () => {
    await sendText()

    const at = new Date("2026-10-19T02:05:00.000Z")
    expect(mockEmit).toHaveBeenCalledTimes(1)
    expect(mockEmit).toHaveBeenCalledWith("analytics:dashboard", {
      eventType: "agent:replied",
      eventId: "reply:msg-1",
      workspaceId: "ws-1",
      conversationId: "conv-1",
      contactId: "c-1",
      adminId: "user-1",
      occurredAt: at,
      awaitingSince,
      measuredFrom: awaitingSince,
      responseSeconds: 300,
      workingResponseSeconds: null,
      workingHoursId: null,
      slaTargetSeconds: null,
      slaMet: null,
      isFirstResponse: true,
      channel: "messenger",
      inboxId: "inbox-1",
    })
  })

  test.each([
    ["a reply before the deadline is met", "2026-10-19T02:05:00.001Z", true],
    [
      "a reply exactly at the deadline is met",
      "2026-10-19T02:05:00.000Z",
      true,
    ],
    ["a reply after the deadline is missed", "2026-10-19T02:04:59.999Z", false],
  ])("SLA: %s", async (_label, slaDueAt, expected) => {
    mockMarkAgentReplied.mockResolvedValue({
      ...claim,
      slaDueAt: new Date(slaDueAt),
      slaTargetSeconds: 3600,
    })

    await sendText()

    expect(mockEmit.mock.calls[0]?.[1]).toMatchObject({
      slaTargetSeconds: 3600,
      slaMet: expected,
    })
  })

  test("a window without an SLA is neither met nor missed", async () => {
    mockMarkAgentReplied.mockResolvedValue({ ...claim, slaDueAt: null })

    await sendText()

    expect(mockEmit.mock.calls[0]?.[1]).toMatchObject({
      slaTargetSeconds: null,
      slaMet: null,
    })
  })

  test("measures from the assignment instant when assigned after the message", async () => {
    const assignedUserAt = new Date("2026-10-19T02:03:00.000Z")
    mockMarkAgentReplied.mockResolvedValue({
      ...claim,
      assignedUserId: "user-1",
      assignedUserAt,
    })

    await sendText()

    const payload = mockEmit.mock.calls[0]?.[1] as {
      measuredFrom: Date
      awaitingSince: Date
      responseSeconds: number
    }
    expect(payload.measuredFrom).toEqual(assignedUserAt)
    expect(payload.awaitingSince).toEqual(awaitingSince)
    expect(payload.responseSeconds).toBe(120)
  })

  test("ignores an assignment that landed after the reply instant", async () => {
    mockMarkAgentReplied.mockResolvedValue({
      ...claim,
      assignedUserId: "user-1",
      assignedUserAt: new Date("2026-10-19T03:00:00.000Z"),
    })

    await sendText()

    expect(mockEmit.mock.calls[0]?.[1]).toMatchObject({
      measuredFrom: awaitingSince,
      responseSeconds: 300,
    })
  })

  test("an async emit rejection is logged as err and does not reject the send", async () => {
    mockEmit.mockRejectedValue(new Error("emit"))

    const result = await sendText()
    await new Promise((resolve) => setImmediate(resolve))

    expect(result).toMatchObject({ id: "msg-1" })
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        eventId: "reply:msg-1",
      }),
      expect.any(String),
    )
  })

  test("computes working seconds from the agent schedule and propagates ids", async () => {
    // Every weekday, all day: working seconds equal elapsed seconds.
    const intervals = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      startMinute: 0,
      endMinute: 1440,
    }))
    mockFindForAgent.mockResolvedValue({ workingHoursId: "wh-1", intervals })
    mockMarkAgentReplied.mockResolvedValue({ ...claim, isFirstResponse: false })

    await sendText()

    const payload = mockEmit.mock.calls[0]?.[1] as {
      responseSeconds: number
      workingResponseSeconds: number
    }
    expect(mockFindForAgent).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      userId: "user-1",
    })
    expect(payload).toMatchObject({
      workingHoursId: "wh-1",
      isFirstResponse: false,
    })
    expect(payload.responseSeconds).toBe(300)
    expect(payload.workingResponseSeconds).toBe(300)
  })

  test("api sender closes the window without emitting", async () => {
    await sendText(false)

    expect(mockMarkAgentReplied).toHaveBeenCalledTimes(1)
    expect(mockEmit).not.toHaveBeenCalled()
    expect(mockFindForAgent).not.toHaveBeenCalled()
  })

  test("emits nothing when no customer message was waiting", async () => {
    mockMarkAgentReplied.mockResolvedValue({
      ...claim,
      closedAwaitingSince: null,
    })
    await sendText()
    expect(mockEmit).not.toHaveBeenCalled()

    mockMarkAgentReplied.mockResolvedValue(null)
    await sendText()
    expect(mockEmit).not.toHaveBeenCalled()
  })

  test("claims only after the send job has been enqueued", async () => {
    await sendText()

    expect(mockChatQueueAdd.mock.invocationCallOrder[0]).toBeLessThan(
      mockMarkAgentReplied.mock.invocationCallOrder[0] ?? 0,
    )
  })

  test("a failed enqueue neither claims nor emits and still throws", async () => {
    mockChatQueueAdd.mockRejectedValue(new Error("redis down"))

    await expect(sendText()).rejects.toThrow("redis down")

    expect(mockMarkAgentReplied).not.toHaveBeenCalled()
    expect(mockEmit).not.toHaveBeenCalled()
  })

  test("flow branch claims after enqueue and emits with a flow event id", async () => {
    await createOutgoing({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      input: { flowId: "flow-1" },
      user: user as never,
    })

    expect(mockIntegrationQueueAdd.mock.invocationCallOrder[0]).toBeLessThan(
      mockMarkAgentReplied.mock.invocationCallOrder[0] ?? 0,
    )
    expect(mockEmit).toHaveBeenCalledTimes(1)
    expect(mockEmit.mock.calls[0]?.[1]).toMatchObject({
      eventType: "agent:replied",
      eventId: "reply:flow:generated-id",
      adminId: "user-1",
    })
  })

  test("flow branch with a failed enqueue does not claim or emit", async () => {
    mockIntegrationQueueAdd.mockRejectedValue(new Error("boom"))

    await expect(
      createOutgoing({
        conversation: conversation as never,
        contactInbox: contactInbox as never,
        input: { flowId: "flow-1" },
        user: user as never,
      }),
    ).rejects.toThrow("boom")

    expect(mockMarkAgentReplied).not.toHaveBeenCalled()
    expect(mockEmit).not.toHaveBeenCalled()
  })

  test.each([
    ["claim", () => mockMarkAgentReplied.mockRejectedValue(new Error("claim"))],
    [
      "emit",
      () =>
        mockEmit.mockImplementation(() => {
          throw new Error("emit")
        }),
    ],
    [
      "schedule lookup",
      () => mockFindForAgent.mockRejectedValue(new Error("schedule")),
    ],
  ])("a %s failure does not reject the enqueued send and is logged as err", async (_name, arrange) => {
    arrange()

    const result = await sendText()

    expect(result).toMatchObject({ id: "msg-1" })
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        workspaceId: "ws-1",
        conversationId: "conv-1",
        eventId: "reply:msg-1",
      }),
      expect.any(String),
    )
  })
})
