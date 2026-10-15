import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  inboxFind: vi.fn(),
  findConnection: vi.fn(),
  listByDisplayPhoneDigits: vi.fn(),
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: { find: mocks.inboxFind },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: { findByProviderSourceId: mocks.findConnection },
  integrationWhatsappRepository: {
    listByDisplayPhoneDigits: mocks.listByDisplayPhoneDigits,
  },
}))

const { resolveInboundWebhookInbox } = await import(
  "../src/inbound-webhook/resolve-inbox"
)

const connected = (id: string, channel = "messenger") => ({
  id,
  channel,
  status: "connected",
  workspaceId: "ws-1",
})

const messengerByPage = {
  mode: "payload" as const,
  channel: "messenger" as const,
  identifierKind: "pageId" as const,
  jsonPath: "$.entry[0].id",
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("inbox mode", () => {
  test("loads the chosen inbox inside the workspace", async () => {
    mocks.inboxFind.mockResolvedValue(connected("11"))

    const result = await resolveInboundWebhookInbox({
      workspaceId: "ws-1",
      resolution: { mode: "inbox", inboxId: "11" },
      inboxIdentifier: null,
    })

    expect(result).toEqual({ inbox: connected("11") })
    expect(mocks.inboxFind).toHaveBeenCalledWith({
      where: { id: "11", workspaceId: "ws-1" },
    })
  })

  test("a deleted inbox is inboxNotFound", async () => {
    mocks.inboxFind.mockResolvedValue(undefined)

    await expect(
      resolveInboundWebhookInbox({
        workspaceId: "ws-1",
        resolution: { mode: "inbox", inboxId: "11" },
        inboxIdentifier: null,
      }),
    ).resolves.toEqual({ skipReason: "inboxNotFound" })
  })

  test("a disconnected inbox is inboxDisconnected", async () => {
    mocks.inboxFind.mockResolvedValue({ ...connected("11"), status: "error" })

    await expect(
      resolveInboundWebhookInbox({
        workspaceId: "ws-1",
        resolution: { mode: "inbox", inboxId: "11" },
        inboxIdentifier: null,
      }),
    ).resolves.toEqual({ skipReason: "inboxDisconnected" })
  })
})

describe("payload mode — inboxSourceId strategy", () => {
  test("finds the inbox whose source id is the page id, scoped to workspace and channel", async () => {
    mocks.inboxFind.mockResolvedValue(connected("12"))

    const result = await resolveInboundWebhookInbox({
      workspaceId: "ws-1",
      resolution: messengerByPage,
      inboxIdentifier: "page-1",
    })

    expect(result).toEqual({ inbox: connected("12") })
    expect(mocks.inboxFind).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1", channel: "messenger", sourceId: "page-1" },
    })
  })

  test("a path that yielded nothing is missingInboxIdentifier, a value with no inbox is inboxNotFound", async () => {
    mocks.inboxFind.mockResolvedValue(undefined)

    await expect(
      resolveInboundWebhookInbox({
        workspaceId: "ws-1",
        resolution: messengerByPage,
        inboxIdentifier: null,
      }),
    ).resolves.toEqual({ skipReason: "missingInboxIdentifier" })
    await expect(
      resolveInboundWebhookInbox({
        workspaceId: "ws-1",
        resolution: messengerByPage,
        inboxIdentifier: "unknown-page",
      }),
    ).resolves.toEqual({ skipReason: "inboxNotFound" })
  })

  test("a stale config whose identifier kind the channel no longer supports is inboxNotFound", async () => {
    await expect(
      resolveInboundWebhookInbox({
        workspaceId: "ws-1",
        resolution: { ...messengerByPage, identifierKind: "igId" },
        inboxIdentifier: "x",
      }),
    ).resolves.toEqual({ skipReason: "inboxNotFound" })
    expect(mocks.inboxFind).not.toHaveBeenCalled()
  })
})

describe("payload mode — connectionSourceId strategy (TikTok)", () => {
  const tiktokByOpenId = {
    mode: "payload" as const,
    channel: "tiktok" as const,
    identifierKind: "openId" as const,
    jsonPath: "$.user_openid",
  }

  test("goes through the connection, then loads its inbox in the workspace", async () => {
    mocks.findConnection.mockResolvedValue({ inboxId: "21" })
    mocks.inboxFind.mockResolvedValue(connected("21", "tiktok"))

    const result = await resolveInboundWebhookInbox({
      workspaceId: "ws-1",
      resolution: tiktokByOpenId,
      inboxIdentifier: "open-1",
    })

    expect(result).toEqual({ inbox: connected("21", "tiktok") })
    expect(mocks.findConnection).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      provider: "tiktok",
      sourceId: "open-1",
    })
    expect(mocks.inboxFind).toHaveBeenCalledWith({
      where: { id: "21", workspaceId: "ws-1" },
    })
  })

  test("a connection without an inbox is inboxNotFound", async () => {
    mocks.findConnection.mockResolvedValue({ inboxId: null })

    await expect(
      resolveInboundWebhookInbox({
        workspaceId: "ws-1",
        resolution: tiktokByOpenId,
        inboxIdentifier: "open-1",
      }),
    ).resolves.toEqual({ skipReason: "inboxNotFound" })
  })
})

describe("payload mode — whatsappDisplayPhone strategy", () => {
  const byDisplayPhone = {
    mode: "payload" as const,
    channel: "whatsapp" as const,
    identifierKind: "displayPhoneNumber" as const,
    jsonPath: "$.to",
  }

  test("compares digits only", async () => {
    mocks.listByDisplayPhoneDigits.mockResolvedValue([
      { id: "i", inboxId: "31" },
    ])
    mocks.inboxFind.mockResolvedValue(connected("31", "whatsapp"))

    await resolveInboundWebhookInbox({
      workspaceId: "ws-1",
      resolution: byDisplayPhone,
      inboxIdentifier: "+84 90-123 4567",
    })

    expect(mocks.listByDisplayPhoneDigits).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      digits: "84901234567",
    })
  })

  test("a value with no digits is missingInboxIdentifier and is never looked up", async () => {
    await expect(
      resolveInboundWebhookInbox({
        workspaceId: "ws-1",
        resolution: byDisplayPhone,
        inboxIdentifier: "N/A",
      }),
    ).resolves.toEqual({ skipReason: "missingInboxIdentifier" })
    expect(mocks.listByDisplayPhoneDigits).not.toHaveBeenCalled()
  })

  test("two numbers with the same display phone are inboxAmbiguous", async () => {
    mocks.listByDisplayPhoneDigits.mockResolvedValue([
      { id: "a", inboxId: "31" },
      { id: "b", inboxId: "32" },
    ])
    mocks.inboxFind.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(connected(where.id, "whatsapp")),
    )

    await expect(
      resolveInboundWebhookInbox({
        workspaceId: "ws-1",
        resolution: byDisplayPhone,
        inboxIdentifier: "+84901234567",
      }),
    ).resolves.toEqual({ skipReason: "inboxAmbiguous" })
  })

  test("no match is inboxNotFound", async () => {
    mocks.listByDisplayPhoneDigits.mockResolvedValue([])

    await expect(
      resolveInboundWebhookInbox({
        workspaceId: "ws-1",
        resolution: byDisplayPhone,
        inboxIdentifier: "+84901234567",
      }),
    ).resolves.toEqual({ skipReason: "inboxNotFound" })
  })
})
