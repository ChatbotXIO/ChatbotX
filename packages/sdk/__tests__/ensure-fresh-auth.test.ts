import { describe, expect, test, vi } from "vitest"
import {
  AuthException,
  AuthRefreshException,
  AuthType,
  type AuthValue,
  type Context,
  Integration,
  type IntegrationDefinition,
  type Oauth2AuthValue,
  SdkException,
} from "../src"

const baseAuth = (expiresAt: string): Oauth2AuthValue => ({
  authType: AuthType.oauth2,
  clientId: "client-1",
  clientSecret: "secret-1",
  redirectUrl: "https://example.com/callback",
  tokens: { accessToken: "token-1", expiresAt },
})

type RefreshAuthFn = (props: {
  auth: Oauth2AuthValue
}) => Promise<Oauth2AuthValue>

const makeIntegration = (refreshAuth: RefreshAuthFn) =>
  new Integration<
    IntegrationDefinition<Record<string, never>, Oauth2AuthValue>
  >({
    name: "fixture",
    actions: {},
    handleRequest: async () => "ok",
    disconnect: async () => undefined,
    refreshAuth,
  })

const makeContext = (auth: Oauth2AuthValue) => {
  const save = vi.fn(async () => undefined)
  const markOffline = vi.fn(async () => undefined)
  const ctx: Context<Oauth2AuthValue> = {
    storagePrefix: "test",
    auth,
    authStore: { load: async () => auth, save, markOffline },
    platform: {
      appUrl: "https://app.test",
      publicRealtimeUrl: "wss://public.test",
      internalRealtimeUrl: "wss://internal.test",
      storageUrl: "https://storage.test",
      getRealtimeBroadcastAuthHeaders: async () => ({}),
    },
  }
  return { ctx, save, markOffline }
}
const makeIntegrationWithoutRefresh = () =>
  new Integration<IntegrationDefinition<Record<string, never>, AuthValue>>({
    name: "fixture-without-refresh",
    actions: {},
    handleRequest: async () => "ok",
    disconnect: async () => undefined,
  })

const makeNonOauthContext = (): Context<AuthValue> => ({
  storagePrefix: "test",
  auth: { authType: AuthType.secretText, secretText: "token-1" },
  platform: {
    appUrl: "https://app.test",
    publicRealtimeUrl: "wss://public.test",
    internalRealtimeUrl: "wss://internal.test",
    storageUrl: "https://storage.test",
    getRealtimeBroadcastAuthHeaders: async () => ({}),
  },
})

describe("Integration.ensureFreshAuth", () => {
  test("no-ops when the token is far from expiry and force is not set", async () => {
    const refreshAuth = vi.fn()
    const integration = makeIntegration(refreshAuth)
    const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const { ctx, save } = makeContext(baseAuth(farFuture))

    const result = await integration.ensureFreshAuth(ctx)

    expect(refreshAuth).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(result.auth.tokens.expiresAt).toBe(farFuture)
  })

  test("refreshes and persists when within the proactive-refresh window", async () => {
    const newAuth = baseAuth(
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    )
    const refreshAuth = vi.fn(async () => newAuth)
    const integration = makeIntegration(refreshAuth)
    const soon = new Date(Date.now() + 60 * 1000).toISOString()
    const { ctx, save } = makeContext(baseAuth(soon))

    const result = await integration.ensureFreshAuth(ctx)

    expect(refreshAuth).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(newAuth)
    expect(result.auth).toBe(newAuth)
  })

  test("force:true refreshes even when the token is far from expiry", async () => {
    const newAuth = baseAuth(
      new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    )
    const refreshAuth = vi.fn(async () => newAuth)
    const integration = makeIntegration(refreshAuth)
    const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const { ctx, save } = makeContext(baseAuth(farFuture))

    const result = await integration.ensureFreshAuth(ctx, { force: true })

    expect(refreshAuth).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(newAuth)
    expect(result.auth).toBe(newAuth)
  })
  test("force:true does not refresh non-oauth2 auth", async () => {
    const refreshAuth = vi.fn(async ({ auth }: { auth: AuthValue }) => auth)
    const integration = new Integration<
      IntegrationDefinition<Record<string, never>, AuthValue>
    >({
      name: "non-oauth-fixture",
      actions: {},
      handleRequest: async () => "ok",
      disconnect: async () => undefined,
      refreshAuth,
    })
    const ctx = makeNonOauthContext()

    const result = await integration.ensureFreshAuth(ctx, { force: true })

    expect(refreshAuth).not.toHaveBeenCalled()
    expect(result.auth).toBe(ctx.auth)
  })

  test("does not proactively refresh when no refresh implementation exists", async () => {
    const integration = makeIntegrationWithoutRefresh()
    const soon = new Date(Date.now() + 60 * 1000).toISOString()
    const { ctx, save } = makeContext(baseAuth(soon))

    const result = await integration.ensureFreshAuth(ctx)

    expect(result.auth).toBe(ctx.auth)
    expect(save).not.toHaveBeenCalled()
  })

  test("force:true rejects when no refresh implementation exists", async () => {
    const integration = makeIntegrationWithoutRefresh()
    const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const { ctx } = makeContext(baseAuth(farFuture))

    await expect(
      integration.ensureFreshAuth(ctx, { force: true }),
    ).rejects.toThrow(SdkException)
  })

  test("marks the connection offline and throws on terminal refresh failure", async () => {
    const refreshAuth: RefreshAuthFn = () => {
      throw new AuthException("revoked")
    }
    const integration = makeIntegration(refreshAuth)

    const { ctx, markOffline } = makeContext(
      baseAuth(new Date(Date.now() + 60 * 60 * 1000).toISOString()),
    )

    await expect(
      integration.ensureFreshAuth(ctx, { force: true }),
    ).rejects.toThrow("after 1 attempt(s)")
    expect(markOffline).toHaveBeenCalledTimes(1)
  })
  test("locks then reloads auth before refreshing to avoid a stale duplicate refresh", async () => {
    const staleAuth = baseAuth(
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    )
    const reloadedAuth = {
      ...baseAuth(new Date(Date.now() + 60 * 1000).toISOString()),
      tokens: {
        accessToken: "reloaded-token",
        expiresAt: new Date(Date.now() + 60 * 1000).toISOString(),
      },
    }
    const newAuth = baseAuth(
      new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    )
    const refreshAuth = vi.fn(async () => newAuth)
    const integration = makeIntegration(refreshAuth)
    const { ctx, save } = makeContext(staleAuth)
    const load = vi.fn(async () => reloadedAuth)
    const withLock = vi.fn(
      async <T>(fn: () => Promise<T>): Promise<T> => await fn(),
    )
    ctx.authStore = { load, save, withLock }

    await expect(integration.ensureFreshAuth(ctx)).resolves.toMatchObject({
      auth: newAuth,
    })
    expect(withLock).toHaveBeenCalledTimes(1)
    expect(refreshAuth).toHaveBeenCalledWith({ auth: reloadedAuth })
    expect(save).toHaveBeenCalledWith(newAuth)
  })

  test("retries a transient refresh failure with backoff before persisting", async () => {
    vi.useFakeTimers()
    try {
      const newAuth = baseAuth(
        new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      )
      const refreshAuth = vi
        .fn()
        .mockRejectedValueOnce(new Error("network unavailable"))
        .mockResolvedValueOnce(newAuth)
      const integration = makeIntegration(refreshAuth)
      const { ctx, save } = makeContext(
        baseAuth(new Date(Date.now() + 60 * 1000).toISOString()),
      )

      const refreshed = integration.ensureFreshAuth(ctx)
      await vi.advanceTimersByTimeAsync(250)

      await expect(refreshed).resolves.toMatchObject({ auth: newAuth })
      expect(refreshAuth).toHaveBeenCalledTimes(2)
      expect(save).toHaveBeenCalledWith(newAuth)
    } finally {
      vi.useRealTimers()
    }
  })

  test("does not mark auth offline after exhausting transient refresh retries", async () => {
    vi.useFakeTimers()
    try {
      const refreshAuth = vi
        .fn()
        .mockRejectedValue(new Error("network unavailable"))
      const integration = makeIntegration(refreshAuth)
      const { ctx, markOffline } = makeContext(
        baseAuth(new Date(Date.now() + 60 * 1000).toISOString()),
      )

      const refreshed = integration.ensureFreshAuth(ctx)
      const expectedFailure =
        expect(refreshed).rejects.toBeInstanceOf(AuthRefreshException)
      await vi.advanceTimersByTimeAsync(750)

      await expectedFailure
      expect(refreshAuth).toHaveBeenCalledTimes(3)
      expect(markOffline).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  test("propagates an auth-store save failure after a successful refresh", async () => {
    const newAuth = baseAuth(
      new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    )
    const integration = makeIntegration(async () => newAuth)
    const { ctx, save, markOffline } = makeContext(
      baseAuth(new Date(Date.now() + 60 * 1000).toISOString()),
    )
    const saveError = new Error("auth store unavailable")
    save.mockRejectedValueOnce(saveError)

    await expect(integration.ensureFreshAuth(ctx)).rejects.toBe(saveError)
    expect(markOffline).not.toHaveBeenCalled()
  })
})
