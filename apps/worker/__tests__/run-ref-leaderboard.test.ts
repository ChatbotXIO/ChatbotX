import { beforeEach, describe, expect, test, vi } from "vitest"

const decodeRef = vi.fn()
const encodeRef = vi.fn()
vi.mock("@chatbotx.io/business", () => ({
  decodeRef,
  encodeRef,
}))

const creditReferral = vi.fn()
const findUnscoped = vi.fn()
vi.mock("@chatbotx.io/business/leaderboard", () => ({
  leaderboardScoringService: { creditReferral },
  leaderboardService: { findUnscoped },
}))

vi.mock("@chatbotx.io/business/utils", () => ({
  canShareMinigame: (channel: string) => channel !== "webchat",
}))

vi.mock("@chatbotx.io/business/minigame", () => ({
  minigameService: { findUnscoped: vi.fn() },
  minigameContactService: { creditSharedLinkReferral: vi.fn() },
}))

const findOrFail = vi.fn()
vi.mock("@chatbotx.io/database/client", () => ({
  findOrFail,
}))

// `ref.ts` -> business/minigame -> ...-> contactService pulls in
// `queries/contact-filter`, which touches many unrelated schema tables at
// module scope. A Proxy sentinel satisfies vitest's "does this export
// exist" check for any table name without listing the whole schema.
vi.mock("@chatbotx.io/database/schema", () => {
  const overrides = {
    flowModel: { id: "flowModel.id" },
    flowVersionModel: { id: "flowVersionModel.id" },
    reflinkModel: { id: "reflinkModel.id" },
  }
  return new Proxy(overrides, {
    get: (target, prop) =>
      prop in target ? target[prop as keyof typeof target] : {},
    has: () => true,
  })
})

const emit = vi.fn()
vi.mock("@chatbotx.io/event-bus", () => ({ emit }))

const emitContactReferredANewContact = vi.fn()
const emitContactReferredExistingContact = vi.fn()
vi.mock("@chatbotx.io/events", () => ({
  emitContactReferredANewContact,
  emitContactReferredExistingContact,
}))

vi.mock("@chatbotx.io/events/context", () => ({
  webhookChannelOrigin: () => "channel",
}))

const integrationQueueAdd = vi.fn()
vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    sendFlow: "sendFlow",
  },
  integrationQueue: {
    add: integrationQueueAdd,
  },
}))

const contactInbox = { id: "ci-1", channel: "messenger", inboxId: "inbox-1" }
vi.mock("../src/lib/db", () => ({
  detectConversationAndContactInbox: vi.fn(async () => ({
    conversation: {
      id: "conversation-1",
      workspaceId: "workspace-1",
      contactId: "invitee-1",
    },
    contactInbox,
  })),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock("../src/integration/handlers/utils/contact", () => ({
  saveResultToCustomField: vi.fn(),
}))

const { runRef } = await import("../src/integration/handlers/ref")

const leaderboard = {
  id: "lb-1",
  workspaceId: "workspace-1",
  inboxId: "inbox-1",
  referralWelcomeFlowId: null,
}

const run = () =>
  runRef({
    conversationId: "conversation-1",
    contactInboxId: "ci-1",
    ref: "lb_x_y",
  } as never)

describe("runRef — leaderboard referral", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    decodeRef.mockReturnValue({
      type: "leaderboard",
      leaderboardId: "lb-1",
      contactId: "referrer-1",
    })
    findUnscoped.mockResolvedValue(leaderboard)
    contactInbox.channel = "messenger"
    contactInbox.inboxId = "inbox-1"
  })

  test("credits the referrer for an arrival on the leaderboard's inbox", async () => {
    await run()
    expect(creditReferral).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      leaderboardId: "lb-1",
      inviteeContactId: "invitee-1",
      referrerContactId: "referrer-1",
    })
  })

  test("webchat arrivals never earn credit (anonymous visitors are free to mint)", async () => {
    contactInbox.channel = "webchat"
    await run()
    expect(creditReferral).not.toHaveBeenCalled()
  })

  test("arrivals on another inbox never earn credit", async () => {
    contactInbox.inboxId = "inbox-2"
    await run()
    expect(creditReferral).not.toHaveBeenCalled()
  })

  test("a leaderboard of another workspace or an unparsable id is ignored", async () => {
    findUnscoped.mockResolvedValueOnce({ ...leaderboard, workspaceId: "other" })
    await run()
    findUnscoped.mockRejectedValueOnce(new Error("bigint out of range"))
    await run()
    expect(creditReferral).not.toHaveBeenCalled()
  })
})
