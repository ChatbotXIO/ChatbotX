// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  findWorkspaceById: vi.fn(),
  handleRequest: vi.fn(),
  recordAuthorization: vi.fn(async () => undefined),
  redirect: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  zaloIntegrationService: { connect: mocks.connect },
  workspaceService: { findById: mocks.findWorkspaceById },
  userService: { recordConnectionAuthorization: mocks.recordAuthorization },
}))
vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: vi.fn() },
}))
vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code = "error"
  },
}))
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
vi.mock("@/integration", () => ({
  integrations: { zalo: { handleRequest: mocks.handleRequest } },
}))

const { connectZaloHandler } = await import("../connect-zalo.action")

const invoke = () =>
  connectZaloHandler({
    zaloSettings: { appId: "app", secretKey: "secret" } as never,
    workspaceId: "workspace-1",
    userId: "admin-1",
    req: new Request("https://app.example.com/integrations/zalo/callback"),
    redirectUrl: "https://app.example.com/integrations/zalo/callback",
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findWorkspaceById.mockResolvedValue({ ownerId: "owner-1" })
  mocks.handleRequest.mockResolvedValue({
    oaId: "oa-1",
    metadata: { oaName: "My OA" },
  })
  mocks.connect.mockResolvedValue({ integrationId: "int-1", wasCreated: true })
})

describe("connectZaloHandler — connection authorization capture", () => {
  test("records the obtained auth once, before the OA is stored", async () => {
    await invoke()

    expect(mocks.recordAuthorization).toHaveBeenCalledTimes(1)
    expect(mocks.recordAuthorization).toHaveBeenCalledWith({
      userId: "admin-1",
      provider: "zalo",
      auth: expect.objectContaining({ oaId: "oa-1" }),
      phase: "authorizationObtained",
      workspaceId: "workspace-1",
    })
    expect(mocks.recordAuthorization.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.connect.mock.invocationCallOrder[0] as number,
    )
  })

  test("records nothing when the authorization itself fails", async () => {
    mocks.handleRequest.mockRejectedValue(new Error("denied"))

    await expect(invoke()).rejects.toThrow("denied")

    expect(mocks.recordAuthorization).not.toHaveBeenCalled()
  })
})
