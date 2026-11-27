import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

describe("introspectToken", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.resetModules()
    vi.useRealTimers()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.useRealTimers()
  })

  test("fetches GET /v1/token with the token as a bearer credential", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        workspaceId: "workspace-1",
        permission: "full",
        scopes: ["contacts"],
      }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { introspectToken } = await import("../src/token-introspection")
    const result = await introspectToken("token-abc")

    expect(result).toEqual({
      status: "ok",
      data: {
        workspaceId: "workspace-1",
        permission: "full",
        scopes: ["contacts"],
      },
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain("/v1/token")
    expect(init?.headers.get("Authorization")).toBe("Bearer token-abc")
  })

  test("sends x-workspace-id when a workspace id is supplied", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        workspaceId: "workspace-1",
        permission: "full",
        scopes: null,
      }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { introspectToken } = await import("../src/token-introspection")
    await introspectToken("token-abc", "workspace-1")

    const [, init] = fetchMock.mock.calls[0]
    expect(init?.headers.get("x-workspace-id")).toBe("workspace-1")
  })

  test("returns unauthorized on a 401 response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    }) as unknown as typeof fetch

    const { introspectToken } = await import("../src/token-introspection")
    await expect(introspectToken("token-bad")).resolves.toEqual({
      status: "unauthorized",
    })
  })

  test("returns configError on a 400 response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "Select a workspace",
    }) as unknown as typeof fetch

    const { introspectToken } = await import("../src/token-introspection")
    const result = await introspectToken("token-multi-workspace")
    expect(result).toEqual({
      status: "configError",
      message: "Select a workspace",
    })
  })

  test("extracts the message from an oRPC 400 error envelope", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          message: "Choose a workspace before continuing",
        }),
    }) as unknown as typeof fetch

    const { introspectToken } = await import("../src/token-introspection")

    await expect(introspectToken("token-multi-workspace")).resolves.toEqual({
      status: "configError",
      message: "Choose a workspace before continuing",
    })
  })

  test("returns unavailable on a 403 response instead of failing hard", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    }) as unknown as typeof fetch

    const { introspectToken } = await import("../src/token-introspection")
    await expect(introspectToken("scoped-token")).resolves.toEqual({
      status: "unavailable",
    })
  })

  test("returns unavailable when the response body doesn't match the expected shape", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ permission: "not-a-real-permission" }),
    }) as unknown as typeof fetch

    const { introspectToken } = await import("../src/token-introspection")
    await expect(introspectToken("token-malformed")).resolves.toEqual({
      status: "unavailable",
    })
  })

  test("returns unavailable when the fetch itself rejects", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("network down")) as unknown as typeof fetch

    const { introspectToken } = await import("../src/token-introspection")
    await expect(introspectToken("token-x")).resolves.toEqual({
      status: "unavailable",
    })
  })

  test("caches a successful result by the token/workspace pair within the TTL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        workspaceId: "workspace-1",
        permission: "full",
        scopes: null,
      }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { introspectToken } = await import("../src/token-introspection")
    await introspectToken("token-cached")
    await introspectToken("token-cached")

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test("different workspace ids for the same token get independent cache entries", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        workspaceId: "workspace-1",
        permission: "full",
        scopes: null,
      }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { introspectToken } = await import("../src/token-introspection")
    await introspectToken("token-shared", "ws-a")
    await introspectToken("token-shared", "ws-b")

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test("different token values get independent cache entries", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        workspaceId: "workspace-1",
        permission: "full",
        scopes: null,
      }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { introspectToken } = await import("../src/token-introspection")
    await introspectToken("token-a")
    await introspectToken("token-b")

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test("re-fetches once the cache entry's TTL has elapsed", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        workspaceId: "workspace-1",
        permission: "full",
        scopes: null,
      }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { introspectToken } = await import("../src/token-introspection")
    await introspectToken("token-ttl")
    // Default CHATBOTX_SPEC_TTL_MS is 300_000ms.
    vi.advanceTimersByTime(300_001)
    await introspectToken("token-ttl")

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test("caches a rejected token for 30 seconds", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { introspectToken } = await import("../src/token-introspection")
    await introspectToken("token-negative-cache")
    vi.advanceTimersByTime(29_999)
    await introspectToken("token-negative-cache")

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // Callers fail closed on `unavailable`, so a long cache would turn one
  // failed call into a lockout that outlives the outage.
  test("caches an unavailable result for 2 seconds only", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { introspectToken } = await import("../src/token-introspection")
    await introspectToken("token-unavailable")
    vi.advanceTimersByTime(1999)
    await introspectToken("token-unavailable")
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(2)
    await introspectToken("token-unavailable")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test("rejects an expired JWT without calling the API", async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const expired = `h.${Buffer.from(JSON.stringify({ exp: 1 })).toString("base64url")}.s`

    const { introspectToken } = await import("../src/token-introspection")

    await expect(introspectToken(expired)).resolves.toEqual({
      status: "unauthorized",
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("evicts expired cache entries once a subsequent lookup inserts a new one", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        workspaceId: "workspace-1",
        permission: "full",
        scopes: null,
      }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { introspectToken } = await import("../src/token-introspection")
    await introspectToken("token-old")
    // Default CHATBOTX_SPEC_TTL_MS is 300_000ms.
    vi.advanceTimersByTime(300_001)

    const deleteSpy = vi.spyOn(Map.prototype, "delete")
    await introspectToken("token-new")

    expect(deleteSpy).toHaveBeenCalledWith("token-old\u0000")
  })
})
