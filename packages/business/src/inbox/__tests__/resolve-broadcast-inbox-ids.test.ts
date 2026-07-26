import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  integrationFindFirst: vi.fn(),
  messengerIntegrationFindFirst: vi.fn(),
  inboxFindMany: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      integrationWhatsappModel: {
        findFirst: mocks.integrationFindFirst,
      },
      integrationMessengerModel: {
        findFirst: mocks.messengerIntegrationFindFirst,
      },
      inboxModel: {
        findMany: mocks.inboxFindMany,
      },
    },
  },
  and: vi.fn(),
  eq: vi.fn(),
  ne: vi.fn(),
  relationsFilterToSQL: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  inboxModel: {},
  workspaceUsageModel: { workspaceId: "workspaceId-column" },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
}))

vi.mock("../../quota-enforcement/service", () => ({
  quotaEnforcementService: {
    tryConsume: vi.fn(),
  },
}))

const { inboxService } = await import("../service")

beforeEach(() => {
  mocks.integrationFindFirst.mockReset()
  mocks.messengerIntegrationFindFirst.mockReset()
  mocks.inboxFindMany.mockReset()
})

describe("InboxService.resolveBroadcastInboxIds", () => {
  test("returns the WhatsApp integration inbox when integrationWhatsappId is present", async () => {
    mocks.integrationFindFirst.mockResolvedValue({ inboxId: "inbox-wa" })

    const result = await inboxService.resolveBroadcastInboxIds({
      workspaceId: "ws-1",
      channels: ["whatsapp"],
      integrationWhatsappId: "wa-1",
    })

    expect(result).toEqual(["inbox-wa"])
    expect(mocks.integrationFindFirst).toHaveBeenCalledWith({
      where: { id: "wa-1", workspaceId: "ws-1" },
      columns: { inboxId: true },
    })
    expect(mocks.inboxFindMany).not.toHaveBeenCalled()
  })

  test("returns an empty list when the WhatsApp integration is not found", async () => {
    mocks.integrationFindFirst.mockResolvedValue(undefined)

    const result = await inboxService.resolveBroadcastInboxIds({
      workspaceId: "ws-1",
      channels: ["whatsapp"],
      integrationWhatsappId: "missing",
    })

    expect(result).toEqual([])
    expect(mocks.inboxFindMany).not.toHaveBeenCalled()
  })

  test("returns the Messenger integration inbox when integrationMessengerId is present", async () => {
    mocks.messengerIntegrationFindFirst.mockResolvedValue({
      inboxId: "inbox-messenger",
    })

    const result = await inboxService.resolveBroadcastInboxIds({
      workspaceId: "ws-1",
      channels: ["messenger"],
      integrationMessengerId: "messenger-1",
    })

    expect(result).toEqual(["inbox-messenger"])
    expect(mocks.messengerIntegrationFindFirst).toHaveBeenCalledWith({
      where: { id: "messenger-1", workspaceId: "ws-1" },
      columns: { inboxId: true },
    })
    expect(mocks.integrationFindFirst).not.toHaveBeenCalled()
    expect(mocks.inboxFindMany).not.toHaveBeenCalled()
  })

  test("prefers WhatsApp integration over Messenger integration and channel", async () => {
    mocks.integrationFindFirst.mockResolvedValue({ inboxId: "inbox-wa" })

    const result = await inboxService.resolveBroadcastInboxIds({
      workspaceId: "ws-1",
      channels: ["messenger"],
      integrationWhatsappId: "wa-1",
      integrationMessengerId: "messenger-1",
    })

    expect(result).toEqual(["inbox-wa"])
    expect(mocks.integrationFindFirst).toHaveBeenCalledWith({
      where: { id: "wa-1", workspaceId: "ws-1" },
      columns: { inboxId: true },
    })
    expect(mocks.messengerIntegrationFindFirst).not.toHaveBeenCalled()
    expect(mocks.inboxFindMany).not.toHaveBeenCalled()
  })

  test("resolves all inboxes for omnichannel", async () => {
    mocks.inboxFindMany.mockResolvedValue([
      { id: "inbox-1" },
      { id: "inbox-2" },
    ])

    const result = await inboxService.resolveBroadcastInboxIds({
      workspaceId: "ws-1",
      channels: ["omnichannel"],
    })

    expect(result).toEqual(["inbox-1", "inbox-2"])
    expect(mocks.inboxFindMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1" },
      columns: { id: true },
    })
  })

  test("returns an empty list when no channel is specified", async () => {
    const result = await inboxService.resolveBroadcastInboxIds({
      workspaceId: "ws-1",
      channels: [],
    })

    expect(result).toEqual([])
    expect(mocks.inboxFindMany).not.toHaveBeenCalled()
  })

  test("filters inboxes by a specific channel", async () => {
    mocks.inboxFindMany.mockResolvedValue([{ id: "inbox-1" }])

    const result = await inboxService.resolveBroadcastInboxIds({
      workspaceId: "ws-1",
      channels: ["messenger"],
    })

    expect(result).toEqual(["inbox-1"])
    expect(mocks.inboxFindMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1", channel: "messenger" },
      columns: { id: true },
    })
  })

  test("filters inboxes by Instagram channel", async () => {
    mocks.inboxFindMany.mockResolvedValue([{ id: "inbox-instagram" }])

    const result = await inboxService.resolveBroadcastInboxIds({
      workspaceId: "ws-1",
      channels: ["instagram"],
    })

    expect(result).toEqual(["inbox-instagram"])
    expect(mocks.inboxFindMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1", channel: "instagram" },
      columns: { id: true },
    })
  })

  test("filters inboxes by Telegram channel", async () => {
    mocks.inboxFindMany.mockResolvedValue([{ id: "inbox-telegram" }])

    const result = await inboxService.resolveBroadcastInboxIds({
      workspaceId: "ws-1",
      channels: ["telegram"],
    })

    expect(result).toEqual(["inbox-telegram"])
    expect(mocks.inboxFindMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1", channel: "telegram" },
      columns: { id: true },
    })
  })

  test("filters inboxes by TikTok channel", async () => {
    mocks.inboxFindMany.mockResolvedValue([{ id: "inbox-tiktok" }])

    const result = await inboxService.resolveBroadcastInboxIds({
      workspaceId: "ws-1",
      channels: ["tiktok"],
    })

    expect(result).toEqual(["inbox-tiktok"])
    expect(mocks.inboxFindMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1", channel: "tiktok" },
      columns: { id: true },
    })
  })

  test("filters inboxes by multiple specific channels", async () => {
    mocks.inboxFindMany.mockResolvedValue([
      { id: "inbox-1" },
      { id: "inbox-2" },
    ])

    const result = await inboxService.resolveBroadcastInboxIds({
      workspaceId: "ws-1",
      channels: ["messenger", "whatsapp"],
    })

    expect(result).toEqual(["inbox-1", "inbox-2"])
    expect(mocks.inboxFindMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "ws-1",
        channel: { in: ["messenger", "whatsapp"] },
      },
      columns: { id: true },
    })
  })

  test("resolves all inboxes when multiple channels include omnichannel", async () => {
    mocks.inboxFindMany.mockResolvedValue([{ id: "inbox-1" }])

    const result = await inboxService.resolveBroadcastInboxIds({
      workspaceId: "ws-1",
      channels: ["messenger", "omnichannel"],
    })

    expect(result).toEqual(["inbox-1"])
    expect(mocks.inboxFindMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1" },
      columns: { id: true },
    })
  })
})
