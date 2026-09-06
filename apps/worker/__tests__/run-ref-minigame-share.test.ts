import { beforeEach, describe, expect, test, vi } from "vitest"

const decodeRef = vi.fn()
const encodeRef = vi.fn()
vi.mock("@chatbotx.io/business", () => ({ decodeRef, encodeRef }))

const findUnscoped = vi.fn()
const creditSharedLinkReferral = vi.fn()
const isMinigameWithinPlayWindow = vi.fn()
vi.mock("@chatbotx.io/business/minigame", () => ({
  minigameService: { findUnscoped },
  minigameContactService: { creditSharedLinkReferral },
  isMinigameWithinPlayWindow,
}))

const findOrFail = vi.fn()
vi.mock("@chatbotx.io/database/client", () => ({ findOrFail }))

vi.mock("@chatbotx.io/database/schema", () => ({
  flowModel: { id: "flowModel.id" },
  flowVersionModel: { id: "flowVersionModel.id" },
  reflinkModel: { id: "reflinkModel.id" },
}))

const emit = vi.fn()
vi.mock("@chatbotx.io/event-bus", () => ({ emit }))

vi.mock("@chatbotx.io/events", () => ({
  emitContactReferredANewContact: vi.fn(),
  emitContactReferredExistingContact: vi.fn(),
}))

vi.mock("@chatbotx.io/events/context", () => ({
  webhookChannelOrigin: () => "channel",
}))

const integrationQueueAdd = vi.fn()
vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { sendFlow: "sendFlow" },
  integrationQueue: { add: integrationQueueAdd },
}))

vi.mock("../src/lib/db", () => ({
  detectConversationAndContactInbox: vi.fn(async () => ({
    conversation: {
      id: "conversation-1",
      workspaceId: "workspace-1",
      contactId: "invitee-1",
    },
    contactInbox: { id: "contact-inbox-1", channel: "messenger" },
  })),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock("../src/integration/handlers/utils/contact", () => ({
  saveResultToCustomField: vi.fn(),
}))

const { runRef } = await import("../src/integration/handlers/ref")

const minigame = (overrides: Record<string, unknown> = {}) => ({
  id: "minigame-1",
  workspaceId: "workspace-1",
  enabled: true,
  playerSettings: { sharingFlowId: "flow-1", sharingNodeId: "node-1" },
  ...overrides,
})

const job = {
  conversationId: "conversation-1",
  contactInboxId: "contact-inbox-1",
  ref: "mg_abc_def",
  messageId: "message-1",
  isNewContact: true,
}

describe("runRef — minigame-share", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    decodeRef.mockReturnValue({
      type: "minigame-share",
      minigameId: "minigame-1",
      referrerContactId: "referrer-1",
    })
    findUnscoped.mockResolvedValue(minigame())
    findOrFail.mockResolvedValue({ id: "flow-1" })
    integrationQueueAdd.mockResolvedValue(undefined)
    creditSharedLinkReferral.mockResolvedValue(true)
    isMinigameWithinPlayWindow.mockReturnValue(true)
  })

  test("runs the configured sharing node and credits the referrer", async () => {
    await runRef(job)

    expect(integrationQueueAdd).toHaveBeenCalledWith("sendFlow", {
      type: "sendFlow",
      data: expect.objectContaining({
        flowId: "flow-1",
        nodeId: "node-1",
        origin: "channel",
      }),
    })
    expect(creditSharedLinkReferral).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: "invitee-1",
        contactInboxId: "contact-inbox-1",
        referrerContactId: "referrer-1",
      }),
    )
  })

  // The ref is fully attacker-controllable, so a crafted `mg_` must not be
  // able to run another workspace's flow.
  test("ignores a ref pointing at another workspace's minigame", async () => {
    findUnscoped.mockResolvedValue(minigame({ workspaceId: "workspace-2" }))

    await runRef(job)

    expect(integrationQueueAdd).not.toHaveBeenCalled()
    expect(creditSharedLinkReferral).not.toHaveBeenCalled()
  })

  test("ignores a disabled minigame", async () => {
    findUnscoped.mockResolvedValue(minigame({ enabled: false }))

    await runRef(job)

    expect(integrationQueueAdd).not.toHaveBeenCalled()
    expect(creditSharedLinkReferral).not.toHaveBeenCalled()
  })

  // `enabled` stays true after a campaign ends, so the play window is a
  // separate gate: past it the bonus draw would be unspendable anyway, and
  // the Sharing Node must not keep messaging arrivals.
  test("ignores a minigame outside its play window", async () => {
    isMinigameWithinPlayWindow.mockReturnValue(false)

    await runRef(job)

    expect(integrationQueueAdd).not.toHaveBeenCalled()
    expect(creditSharedLinkReferral).not.toHaveBeenCalled()
  })

  test("ignores a ref for a minigame that no longer exists", async () => {
    findUnscoped.mockResolvedValue(undefined)

    await runRef(job)

    expect(integrationQueueAdd).not.toHaveBeenCalled()
    expect(creditSharedLinkReferral).not.toHaveBeenCalled()
  })

  // Legacy `playerSettings` jsonb has neither key. The referral still counts —
  // it is about the friend arriving, not the message they received.
  test("still credits when no sharing node is configured", async () => {
    findUnscoped.mockResolvedValue(minigame({ playerSettings: {} }))

    await runRef(job)

    expect(integrationQueueAdd).not.toHaveBeenCalled()
    expect(creditSharedLinkReferral).toHaveBeenCalledTimes(1)
  })

  test("still credits when the configured flow has been deleted", async () => {
    findOrFail.mockRejectedValue(new Error("Flow not found"))

    await expect(runRef(job)).resolves.toBeUndefined()

    expect(integrationQueueAdd).not.toHaveBeenCalled()
    expect(creditSharedLinkReferral).toHaveBeenCalledTimes(1)
  })

  // Bookkeeping must never fail the job and send the invitee's message twice.
  test("does not fail the job when crediting throws", async () => {
    creditSharedLinkReferral.mockRejectedValue(new Error("db down"))

    await expect(runRef(job)).resolves.toBeUndefined()

    expect(integrationQueueAdd).toHaveBeenCalledTimes(1)
  })

  test("reports a bot response only when a flow was actually enqueued", async () => {
    findUnscoped.mockResolvedValue(minigame({ playerSettings: {} }))
    await runRef(job)
    expect(emit).not.toHaveBeenCalled()

    vi.clearAllMocks()
    findUnscoped.mockResolvedValue(minigame())
    findOrFail.mockResolvedValue({ id: "flow-1" })
    creditSharedLinkReferral.mockResolvedValue(true)
    await runRef(job)
    expect(emit).toHaveBeenCalledWith(
      "analytics:dashboard",
      expect.objectContaining({ hasResponse: true }),
    )
  })
})
