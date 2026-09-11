// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  findWorkspaceById: vi.fn(),
  auditRecord: vi.fn(),
  handleRequest: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  tiktokIntegrationService: { connect: mocks.connect },
  workspaceService: { findById: mocks.findWorkspaceById },
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: mocks.auditRecord },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code: string

    constructor(message: string, code = "error") {
      super(message)
      this.code = code
    }
  },
}))

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}))

vi.mock("@/integration", () => ({
  integrations: {
    tiktok: { handleRequest: mocks.handleRequest },
  },
}))

const { connectTiktokHandler } = await import(
  "../src/features/integration-tiktok/actions/connect.action"
)

describe("connectTiktokHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findWorkspaceById.mockResolvedValue({ ownerId: "owner-1" })
    mocks.handleRequest.mockResolvedValue({
      metadata: {
        openId: "open-id-1",
        displayName: "TikTok Shop",
        username: "shop_1",
      },
    })
  })

  test("records reconnect audit with the persisted TikTok integration id on conflict", async () => {
    mocks.connect.mockResolvedValue({
      wasCreated: false,
      integration: { id: "existing-integration-id" },
    })

    await connectTiktokHandler({
      tiktokSettings: { clientId: "client", clientSecret: "secret" },
      workspaceId: "workspace-1",
      userId: "admin-1",
      req: new Request("https://app.example.com/integrations/tiktok/callback"),
      redirectUrl: "https://app.example.com/integrations/tiktok/callback",
    })

    expect(mocks.connect).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ownerId: "owner-1",
      openId: "open-id-1",
      username: "shop_1",
      displayName: "TikTok Shop",
      auth: expect.objectContaining({
        metadata: expect.objectContaining({ openId: "open-id-1" }),
      }),
    })
    expect(mocks.auditRecord).toHaveBeenCalledTimes(1)
    expect(mocks.auditRecord).toHaveBeenCalledWith({
      userId: "admin-1",
      workspaceId: "workspace-1",
      action: "update",
      detail: "reconnected the TikTok channel (#existing-integration-id)",
      ipAddress: "unknown",
      userAgent: undefined,
    })
  })
})
