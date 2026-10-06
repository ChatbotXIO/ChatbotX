import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByProviderSourceId: vi.fn(),
  recordAuthSaved: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: {
    findByProviderSourceId: mocks.findByProviderSourceId,
  },
}))

vi.mock("../../logger", () => ({
  logger: { warn: mocks.loggerWarn, error: vi.fn(), info: vi.fn() },
}))

vi.mock("../state-service", () => ({
  connectionStateService: { recordAuthSaved: mocks.recordAuthSaved },
}))

// Dynamic `import()` is required here, not a static import: the `vi.mock`
// calls above must be registered before the SUT (and its
// `@chatbotx.io/database/repositories`/`../logger`/`../state-service`
// dependencies) is evaluated, which only a post-`vi.mock` dynamic import
// guarantees.
const { recordRefreshedAuth } = await import("../record-refreshed-auth")
const { InvalidConnectionTransitionException } = await import("../state")

const oauth2Auth = {
  authType: "oauth2" as const,
  clientId: "client-1",
  clientSecret: "secret-1",
  redirectUrl: "https://example.com",
  tokens: {
    accessToken: "token-1",
    expiresAt: "2026-10-10T00:00:00.000Z",
  },
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe("recordRefreshedAuth", () => {
  test("heals a degraded connection and sets authExpiresAt from the refreshed oauth2 auth", async () => {
    mocks.findByProviderSourceId.mockResolvedValue({
      id: "conn-1",
      status: "degraded",
    })

    await recordRefreshedAuth({
      workspaceId: "ws-1",
      provider: "messenger",
      sourceId: "page-1",
      auth: oauth2Auth,
    })

    expect(mocks.findByProviderSourceId).toHaveBeenCalledWith(
      { workspaceId: "ws-1", provider: "messenger", sourceId: "page-1" },
      undefined,
    )
    expect(mocks.recordAuthSaved).toHaveBeenCalledWith({
      connectionId: "conn-1",
      authExpiresAt: new Date(oauth2Auth.tokens.expiresAt),
      tx: undefined,
    })
  })

  test("no-ops when no Connection row exists for this provider/sourceId", async () => {
    mocks.findByProviderSourceId.mockResolvedValue(undefined)

    await recordRefreshedAuth({
      workspaceId: "ws-1",
      provider: "messenger",
      sourceId: "page-1",
      auth: oauth2Auth,
    })

    expect(mocks.recordAuthSaved).not.toHaveBeenCalled()
  })

  test("no-ops without calling recordAuthSaved when the connection is inactive", async () => {
    mocks.findByProviderSourceId.mockResolvedValue({
      id: "conn-1",
      status: "disconnected",
    })

    await recordRefreshedAuth({
      workspaceId: "ws-1",
      provider: "messenger",
      sourceId: "page-1",
      auth: oauth2Auth,
    })

    expect(mocks.recordAuthSaved).not.toHaveBeenCalled()
  })

  test("tolerates a race where the connection went inactive between the lookup and the transition, logging instead of throwing", async () => {
    mocks.findByProviderSourceId.mockResolvedValue({
      id: "conn-1",
      status: "connected",
    })
    mocks.recordAuthSaved.mockRejectedValue(
      new InvalidConnectionTransitionException("disconnected", "auth.saved"),
    )

    await expect(
      recordRefreshedAuth({
        workspaceId: "ws-1",
        provider: "messenger",
        sourceId: "page-1",
        auth: oauth2Auth,
      }),
    ).resolves.toBeUndefined()

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(InvalidConnectionTransitionException),
        connectionId: "conn-1",
      }),
      "recordRefreshedAuth: projection sync failed; auth was still saved",
    )
  })

  test("swallows any other unexpected error from recordAuthSaved instead of rejecting", async () => {
    mocks.findByProviderSourceId.mockResolvedValue({
      id: "conn-1",
      status: "connected",
    })
    mocks.recordAuthSaved.mockRejectedValue(new Error("db write failed"))

    await expect(
      recordRefreshedAuth({
        workspaceId: "ws-1",
        provider: "messenger",
        sourceId: "page-1",
        auth: oauth2Auth,
      }),
    ).resolves.toBeUndefined()

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        connectionId: "conn-1",
      }),
      "recordRefreshedAuth: projection sync failed; auth was still saved",
    )
  })

  test("forwards the caller-supplied tx to both the lookup and the transition", async () => {
    const tx = { marker: "tx" } as never
    mocks.findByProviderSourceId.mockResolvedValue({
      id: "conn-1",
      status: "connected",
    })

    await recordRefreshedAuth({
      workspaceId: "ws-1",
      provider: "messenger",
      sourceId: "page-1",
      auth: oauth2Auth,
      tx,
    })

    expect(mocks.findByProviderSourceId).toHaveBeenCalledWith(
      expect.anything(),
      tx,
    )
    expect(mocks.recordAuthSaved).toHaveBeenCalledWith(
      expect.objectContaining({ tx }),
    )
  })
})
