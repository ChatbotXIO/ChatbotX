// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  connectChannelIntegration: vi.fn(),
  findWorkspaceById: vi.fn(),
  transaction: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoUpdate: vi.fn(),
  returning: vi.fn(),
  auditRecord: vi.fn(),
  handleRequest: vi.fn(),
  createId: vi.fn(() => "generated-integration-id"),
  redirect: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  connectChannelIntegration: mocks.connectChannelIntegration,
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

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.transaction },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationTiktokModel: { id: "id", openId: "openId" },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: mocks.createId,
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
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        insert: mocks.insert,
      }),
    )
    mocks.insert.mockReturnValue({ values: mocks.values })
    mocks.values.mockReturnValue({
      onConflictDoUpdate: mocks.onConflictDoUpdate,
    })
    mocks.onConflictDoUpdate.mockReturnValue({ returning: mocks.returning })
    mocks.returning.mockResolvedValue([{ id: "existing-integration-id" }])
  })

  test("records reconnect audit with the persisted TikTok integration id on conflict", async () => {
    mocks.connectChannelIntegration.mockImplementation(
      async ({ insertIntegration }) => {
        const integration = await insertIntegration("inbox-1", false)
        return { wasCreated: false, integration }
      },
    )

    await connectTiktokHandler({
      tiktokSettings: { clientId: "client", clientSecret: "secret" },
      workspaceId: "workspace-1",
      userId: "admin-1",
      req: new Request("https://app.example.com/integrations/tiktok/callback"),
      redirectUrl: "https://app.example.com/integrations/tiktok/callback",
    })

    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "generated-integration-id",
        inboxId: "inbox-1",
        workspaceId: "workspace-1",
        openId: "open-id-1",
      }),
    )
    expect(mocks.returning).toHaveBeenCalledWith({ id: "id" })
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
