import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  openEmailThread: vi.fn(),
  findActiveById: vi.fn(),
  queueAdd: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: { openEmailThread: mocks.openEmailThread },
  flowService: {
    findActiveById: mocks.findActiveById,
    resolveStartTarget: vi.fn(),
  },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { sendFlow: "sendFlow" },
  integrationQueue: { add: mocks.queueAdd },
}))
vi.mock("@chatbotx.io/events/context", () => ({
  webhookChannelOrigin: () => ({}),
}))

const { startAnotherFlow } = await import(
  "../src/trigger/services/actions/flow-actions"
)

const smtpInbox = { id: "ci-1", channel: "smtp", inboxId: "inbox-1" }
const run = (overrides: Record<string, unknown>, channel = "smtp") =>
  startAnotherFlow({
    context: {
      action: { flowId: "flow-1" },
      contactId: "contact-1",
      workspaceId: "ws-1",
      source: { kind: "trigger", triggerId: "t-1" },
      occurrenceKey: "trigger:occ:t-1:0",
      ...overrides,
    },
    conversation: { id: "latest-conv" },
    scope: {
      getContactInbox: async () => ({ ...smtpInbox, channel }),
    },
  } as never)

describe("startAnotherFlow on an SMTP contact", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findActiveById.mockResolvedValue({ currentVersionId: "v1" })
    mocks.openEmailThread.mockResolvedValue({ id: "outreach-conv" })
  })

  test("opens a fresh outreach thread when the event carries no conversation", async () => {
    await run({})

    expect(mocks.openEmailThread).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: "contact-1",
        contactInboxId: "ci-1",
        seed: "trigger:occ:t-1:0",
      }),
    )
    expect(mocks.queueAdd.mock.calls[0]?.[1].data.conversationId).toBe(
      "outreach-conv",
    )
  })

  test("replies into the event's own conversation when there is one", async () => {
    await run({ conversationId: "event-conv" })

    expect(mocks.openEmailThread).not.toHaveBeenCalled()
    expect(mocks.queueAdd.mock.calls[0]?.[1].data.conversationId).toEqual({
      id: "latest-conv",
    })
  })

  test("leaves other channels on the resolved conversation", async () => {
    await run({}, "messenger")

    expect(mocks.openEmailThread).not.toHaveBeenCalled()
    expect(mocks.queueAdd.mock.calls[0]?.[1].data.conversationId).toEqual({
      id: "latest-conv",
    })
  })
})
