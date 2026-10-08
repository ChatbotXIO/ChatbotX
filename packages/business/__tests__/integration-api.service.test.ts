import { beforeEach, describe, expect, test, vi } from "vitest"
import { ChatbotXException } from "../src/errors"

const mocks = vi.hoisted(() => ({
  assertPublicUrl: vi.fn(),
  createId: vi.fn(() => "api-1"),
  dispatchAuditRecord: vi.fn(),
  findByInboxId: vi.fn(),
  generateApiChannelToken: vi.fn(),
  generateSigningSecret: vi.fn(),
  inboxCreate: vi.fn(),
  transaction: vi.fn(),
  upsertConnectionRow: vi.fn(),
  withQuotaCompensation: vi.fn(
    async (_input: unknown, operation: () => Promise<unknown>) =>
      await operation(),
  ),
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mocks.dispatchAuditRecord,
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: { create: mocks.inboxCreate, disconnect: vi.fn() },
}))

vi.mock("../src/connection", () => ({
  CONNECTION_STORE_BINDINGS: { api: { duplicateConstraint: undefined } },
  upsertConnectionRow: mocks.upsertConnectionRow,
  withQuotaCompensation: mocks.withQuotaCompensation,
}))

vi.mock("../src/connection/state-service", () => ({
  connectionStateService: { disconnectInbox: vi.fn() },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.transaction },
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  integrationTypes: { enum: { api: "api" } },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationApiRepository: { findByInboxId: mocks.findByInboxId },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: mocks.createId,
}))

vi.mock("../src/net/ssrf-guard", () => ({
  assertPublicUrl: mocks.assertPublicUrl,
}))

vi.mock("../src/workspace-api-token/credentials", () => ({
  generateApiChannelToken: mocks.generateApiChannelToken,
  generateSigningSecret: mocks.generateSigningSecret,
}))

const { integrationApiService } = await import("../src/integration-api/service")

describe("integrationApiService.connect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createId.mockReturnValue("api-1")
    mocks.withQuotaCompensation.mockImplementation(
      async (_input: unknown, operation: () => Promise<unknown>) =>
        await operation(),
    )
    mocks.inboxCreate.mockResolvedValue({
      inbox: { id: "api-1" },
      wasCreated: true,
    })
    mocks.upsertConnectionRow.mockResolvedValue({ id: "conn-1" })
    mocks.findByInboxId.mockResolvedValue({ id: "api-1" })
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ tx: true }),
    )
    mocks.generateApiChannelToken.mockResolvedValue({
      token: "cbx_api_token",
      tokenHash: "hash",
      tokenPrefix: "prefix",
    })
    mocks.generateSigningSecret.mockReturnValue("signing-secret")
  })

  test("uses actorUserId, not ownerId, for API channel audit records", async () => {
    await integrationApiService.connect({
      ownerId: "owner-1",
      actorUserId: "admin-1",
      workspaceId: "workspace-1",
      name: "Support API",
      auth: { authType: "custom", signingSecret: "secret" },
      tokenHash: "hash",
      tokenPrefix: "prefix",
      callbackUrl: null,
    })

    expect(mocks.upsertConnectionRow).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        provider: "api",
        ownerId: "owner-1",
        actorUserId: "admin-1",
        inboxId: "api-1",
      }),
    )
    expect(mocks.dispatchAuditRecord).toHaveBeenCalledTimes(1)
    expect(mocks.dispatchAuditRecord).toHaveBeenCalledWith({
      userId: "admin-1",
      workspaceId: "workspace-1",
      action: "create",
      detail: "created a new API key (#api-1)",
    })
  })

  test("defers API channel audit attribution to workspace-token context", async () => {
    await integrationApiService.connect({
      ownerId: "owner-1",
      workspaceId: "workspace-1",
      name: "Support API",
      auth: { authType: "custom", signingSecret: "secret" },
      tokenHash: "hash",
      tokenPrefix: "prefix",
      callbackUrl: null,
    })

    expect(mocks.dispatchAuditRecord).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      action: "create",
      detail: "created a new API key (#api-1)",
    })
  })

  test("uses actorUserId for both workspace and API key audit rows", async () => {
    await integrationApiService.connect({
      ownerId: "owner-1",
      actorUserId: "owner-1",
      name: "New Workspace API",
      auth: { authType: "custom", signingSecret: "secret" },
      tokenHash: "hash",
      tokenPrefix: "prefix",
      callbackUrl: "https://example.com/callback",
      createWorkspace: async () => "workspace-2",
    })

    expect(mocks.dispatchAuditRecord).toHaveBeenCalledTimes(2)
    expect(mocks.dispatchAuditRecord).toHaveBeenNthCalledWith(1, {
      userId: "owner-1",
      workspaceId: "workspace-2",
      action: "create",
      detail: "created the workspace (#workspace-2)",
    })
    expect(mocks.dispatchAuditRecord).toHaveBeenNthCalledWith(2, {
      userId: "owner-1",
      workspaceId: "workspace-2",
      action: "create",
      detail: "created a new API key (#api-1)",
    })
  })

  test("returns invalidRequestData when the callback URL is rejected", async () => {
    mocks.assertPublicUrl.mockRejectedValueOnce(new Error("private address"))

    const result = integrationApiService.createWithToken({
      ownerId: "owner-1",
      workspaceId: "workspace-1",
      name: "Support API",
      callbackUrl: "http://10.0.0.1/hook",
    })

    await expect(result).rejects.toBeInstanceOf(ChatbotXException)
    await expect(result).rejects.toMatchObject({
      code: "invalidRequestData",
      httpStatusCode: 422,
      message: "private address",
    })
    expect(mocks.generateApiChannelToken).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.upsertConnectionRow).not.toHaveBeenCalled()
  })

  test("skips the SSRF check when no callback URL is given", async () => {
    await integrationApiService.createWithToken({
      ownerId: "owner-1",
      workspaceId: "workspace-1",
      name: "Support API",
      callbackUrl: null,
    })

    expect(mocks.assertPublicUrl).not.toHaveBeenCalled()
    expect(mocks.upsertConnectionRow).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({ callbackUrl: null }),
      }),
    )
  })

  test("mints a token, validates the callback URL, and returns the upserted connection", async () => {
    const connection = { id: "conn-1" }
    mocks.upsertConnectionRow.mockResolvedValue(connection)

    const result = await integrationApiService.createWithToken({
      ownerId: "owner-1",
      actorUserId: "admin-1",
      workspaceId: "workspace-1",
      name: "Support API",
      callbackUrl: "https://example.com/callback",
    })

    expect(mocks.assertPublicUrl).toHaveBeenCalledWith(
      "https://example.com/callback",
      "API channel callback URL",
    )
    expect(result).toEqual({
      workspaceId: "workspace-1",
      inboxId: "api-1",
      token: "cbx_api_token",
      connection,
    })
    expect(mocks.upsertConnectionRow).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: {
          authType: "custom",
          callbackUrl: "https://example.com/callback",
          signingSecret: "signing-secret",
        },
        extraConfig: {
          callbackUrl: "https://example.com/callback",
          tokenHash: "hash",
          tokenPrefix: "prefix",
        },
      }),
    )
  })
})
