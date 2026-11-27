// @vitest-environment node
import { describe, expect, test, vi } from "vitest"

const m = vi.hoisted(() => {
  const order: string[] = []
  return {
    order,
    runAction: vi.fn((name: string) => {
      order.push(name)
      if (name === "connect") {
        return Promise.resolve({ auth: { a: 1 }, bot: { displayName: "Bot" } })
      }
      if (name === "registerWebhook") {
        return Promise.resolve({ previousWebhookUrl: null })
      }
      return Promise.resolve({ success: true, active: true })
    }),
    connect: vi.fn(),
    updateAuth: vi.fn(),
    markTokenRefreshError: vi.fn(async () => undefined),
    resolveVisibleChannels: vi.fn(() => Promise.resolve(["line"])),
    resolveChannelPolicy: vi.fn(() =>
      Promise.resolve({ visibleChannels: ["line"] }),
    ),
    refreshAuth: vi.fn(),
    record: vi.fn(async () => undefined),
  }
})
vi.mock("@/lib/tenant/request-tenant", () => ({
  resolveRequestTenantId: vi.fn(async () => "1"),
}))

vi.mock("@/integration", () => ({
  integrations: {
    line: { runAction: m.runAction, refreshAuth: m.refreshAuth },
  },
}))
vi.mock("@/env", () => ({ isCloud: () => false }))
vi.mock("@/lib/log", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock("@/lib/oauth-broker", () => ({
  buildBrokerCallbackUrl: (p: string) => `https://b${p}`,
}))
vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: vi.fn() },
}))
vi.mock("@chatbotx.io/business", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  hasWorkspaceAccess: vi.fn(async () => true),
  userQuotaService: {},
  workspaceService: { findOrFail: vi.fn(async () => ({ ownerId: "owner1" })) },
  lineIntegrationService: {
    connect: m.connect,
    updateAuth: m.updateAuth,
    markTokenRefreshError: m.markTokenRefreshError,
  },
  tenantService: { resolveVisibleChannels: m.resolveVisibleChannels },
  userService: { recordConnectionAuthorization: m.record },
}))
vi.mock("@/lib/workspace/resolve-visible-channels", () => ({
  resolveChannelPolicy: m.resolveChannelPolicy,
}))

import {
  checkConnectedLineWebhook,
  connectLine,
  ensureFreshLineAuth,
} from "@/features/integration-line/lib/connect-line"

describe("connectLine", () => {
  test("runs the webhook test after the connect transaction commits", async () => {
    m.connect.mockImplementation(async (input: any) => {
      await input.onConnected({ integrationId: "1" })
      m.order.push("committed")
      return {
        workspaceId: "w1",
        createdWorkspace: false,
        wasCreated: false,
        integrationId: "1",
        inboxId: "2",
      }
    })
    const result = await connectLine({
      workspaceId: "w1",
      user: null,
      channelId: "123",
      channelSecret: "s",
    })
    expect(m.order).toEqual([
      "connect",
      "registerWebhook",
      "committed",
      "testWebhook",
    ])
    expect(m.connect.mock.calls[0]?.[0]).toMatchObject({ createdBy: "owner1" })
    expect(result.webhook).toMatchObject({ active: true, testOk: true })
  })

  test("records the validated credentials once, before the channel is stored (workspace token: no user)", async () => {
    m.connect.mockResolvedValueOnce({
      workspaceId: "w1",
      createdWorkspace: false,
      wasCreated: false,
      integrationId: "1",
      inboxId: "2",
    })

    await connectLine({
      workspaceId: "w1",
      user: null,
      channelId: "123",
      channelSecret: "s",
    })

    expect(m.record).toHaveBeenCalledTimes(1)
    expect(m.record).toHaveBeenCalledWith({
      userId: null,
      provider: "line",
      auth: { a: 1 },
      phase: "credentialsValidated",
      workspaceId: "w1",
    })
    expect(m.record.mock.invocationCallOrder[0]).toBeLessThan(
      m.connect.mock.invocationCallOrder[0] as number,
    )
  })

  test("a new-workspace connect records once, with a null workspace, before connecting", async () => {
    m.connect.mockResolvedValueOnce({
      workspaceId: "w-new",
      createdWorkspace: true,
      wasCreated: true,
      integrationId: "1",
      inboxId: "2",
    })

    await connectLine({
      user: { id: "u1", email: "a@b.c" } as never,
      channelId: "123",
      channelSecret: "s",
    })

    expect(m.record).toHaveBeenCalledTimes(1)
    expect(m.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        workspaceId: null,
        phase: "credentialsValidated",
      }),
    )
    expect(m.record.mock.invocationCallOrder[0]).toBeLessThan(
      m.connect.mock.invocationCallOrder[0] as number,
    )
  })

  test("a new-workspace connect that fails still records once, with a null workspace", async () => {
    m.connect.mockRejectedValueOnce(new Error("db down"))

    await expect(
      connectLine({
        user: { id: "u1", email: "a@b.c" } as never,
        channelId: "123",
        channelSecret: "s",
      }),
    ).rejects.toBeDefined()

    expect(m.record).toHaveBeenCalledTimes(1)
    expect(m.record).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", workspaceId: null }),
    )
  })

  test("records nothing when LINE rejects the credentials", async () => {
    const { SdkException } = await import("@chatbotx.io/sdk")
    m.runAction.mockRejectedValueOnce(new SdkException("bad", "lineError", 401))

    await expect(
      connectLine({
        workspaceId: "w1",
        user: null,
        channelId: "1",
        channelSecret: "s",
      }),
    ).rejects.toMatchObject({ code: "connectionCredentialsRejected" })

    expect(m.record).not.toHaveBeenCalled()
  })

  test("maps a LINE 401 to connectionCredentialsRejected", async () => {
    const { SdkException } = await import("@chatbotx.io/sdk")
    m.runAction.mockRejectedValueOnce(new SdkException("bad", "lineError", 401))
    await expect(
      connectLine({
        workspaceId: "w1",
        user: null,
        channelId: "1",
        channelSecret: "s",
      }),
    ).rejects.toMatchObject({ code: "connectionCredentialsRejected" })
  })

  test("wraps an unknown error in a generic ChatbotXException", async () => {
    m.runAction.mockRejectedValueOnce(new Error("boom"))
    await expect(
      connectLine({
        workspaceId: "w1",
        user: null,
        channelId: "1",
        channelSecret: "s",
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("Failed to connect LINE"),
    })
  })

  test("refuses a tenant-hidden LINE channel (workspace)", async () => {
    m.resolveChannelPolicy.mockResolvedValueOnce({
      visibleChannels: ["telegram"],
    })
    await expect(
      connectLine({
        workspaceId: "w1",
        user: null,
        channelId: "1",
        channelSecret: "s",
      }),
    ).rejects.toMatchObject({ code: "channelHidden" })
    expect(m.runAction).not.toHaveBeenCalled()
  })

  test("refuses a tenant-hidden LINE channel (new workspace)", async () => {
    m.resolveVisibleChannels.mockResolvedValueOnce(["telegram"])
    await expect(
      connectLine({
        user: { id: "u1", email: "a@b.c" } as never,
        channelId: "1",
        channelSecret: "s",
      }),
    ).rejects.toMatchObject({ code: "channelHidden" })
  })

  test("user null without workspaceId is a 404", async () => {
    await expect(
      connectLine({ user: null, channelId: "1", channelSecret: "s" }),
    ).rejects.toMatchObject({ code: "notFound", httpStatusCode: 404 })
  })

  test("a 4xx while registering the webhook is lineWebhookRejected", async () => {
    const { SdkException } = await import("@chatbotx.io/sdk")
    m.connect.mockImplementationOnce(async (input: any) => {
      m.runAction.mockRejectedValueOnce(
        new SdkException("bad url", "lineError", 400),
      )
      await input.onConnected({ integrationId: "1" })
    })
    await expect(
      connectLine({
        workspaceId: "w1",
        user: null,
        channelId: "1",
        channelSecret: "s",
      }),
    ).rejects.toMatchObject({ code: "lineWebhookRejected" })
  })

  test("a timeout maps to connectionProviderUnavailable", async () => {
    const err = new Error("timed out")
    err.name = "TimeoutError"
    m.runAction.mockRejectedValueOnce(err)
    await expect(
      connectLine({
        workspaceId: "w1",
        user: null,
        channelId: "1",
        channelSecret: "s",
      }),
    ).rejects.toMatchObject({
      code: "connectionProviderUnavailable",
      httpStatusCode: 502,
    })
  })

  test("a fetch TypeError maps to connectionProviderUnavailable", async () => {
    m.runAction.mockRejectedValueOnce(new TypeError("fetch failed"))
    await expect(
      connectLine({
        workspaceId: "w1",
        user: null,
        channelId: "1",
        channelSecret: "s",
      }),
    ).rejects.toMatchObject({ code: "connectionProviderUnavailable" })
  })

  test("ensureFreshLineAuth refreshes an expired token and persists it", async () => {
    const fresh = {
      tokens: { expiresAt: new Date(Date.now() + 1e9).toISOString() },
    }
    m.refreshAuth.mockResolvedValueOnce(fresh)
    const out = await ensureFreshLineAuth({
      id: "1",
      workspaceId: "w1",
      auth: {
        tokens: { expiresAt: new Date(Date.now() - 1000).toISOString() },
      },
    })
    expect(out).toBe(fresh)
    expect(m.updateAuth).toHaveBeenCalledWith({
      id: "1",
      workspaceId: "w1",
      auth: fresh,
    })
  })

  test("checkConnectedLineWebhook reports a revoked-credentials refresh failure and marks the channel offline", async () => {
    const { AuthException } = await import("@chatbotx.io/sdk")
    m.refreshAuth.mockRejectedValueOnce(
      new AuthException("invalid_client", "lineAuthError", 400),
    )
    const out = await checkConnectedLineWebhook({
      id: "1",
      workspaceId: "w1",
      auth: {
        tokens: { expiresAt: new Date(Date.now() - 1000).toISOString() },
      },
    })
    expect(out).toEqual({
      active: false,
      testOk: false,
      testReason: "invalid_client",
    })
    expect(m.markTokenRefreshError).toHaveBeenCalledWith({
      id: "1",
      workspaceId: "w1",
      error: "invalid_client",
      isRevoked: true,
    })
  })

  test("checkConnectedLineWebhook does not mark offline on a transient refresh failure", async () => {
    m.markTokenRefreshError.mockClear()
    m.refreshAuth.mockRejectedValueOnce(new Error("network down"))
    const out = await checkConnectedLineWebhook({
      id: "1",
      workspaceId: "w1",
      auth: {
        tokens: { expiresAt: new Date(Date.now() - 1000).toISOString() },
      },
    })
    expect(out).toMatchObject({ testOk: false, testReason: "network down" })
    expect(m.markTokenRefreshError).not.toHaveBeenCalled()
  })
})
