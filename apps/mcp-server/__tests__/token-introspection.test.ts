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
      workspaceId: "workspace-1",
      permission: "full",
      scopes: ["contacts"],
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain("/v1/token")
    expect(init?.headers).toMatchObject({ Authorization: "Bearer token-abc" })
  })

  test("returns null on a non-2xx response instead of throwing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    }) as unknown as typeof fetch

    const { introspectToken } = await import("../src/token-introspection")
    await expect(introspectToken("token-bad")).resolves.toBeNull()
  })

  test("returns null when the response body doesn't match the expected shape", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ permission: "not-a-real-permission" }),
    }) as unknown as typeof fetch

    const { introspectToken } = await import("../src/token-introspection")
    await expect(introspectToken("token-malformed")).resolves.toBeNull()
  })

  test("returns null when the fetch itself rejects", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("network down")) as unknown as typeof fetch

    const { introspectToken } = await import("../src/token-introspection")
    await expect(introspectToken("token-x")).resolves.toBeNull()
  })

  test("caches a successful result by the raw token value within the TTL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
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

  test("different token values get independent cache entries", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
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

  test("evicts expired cache entries once a subsequent lookup inserts a new one", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
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

    expect(deleteSpy).toHaveBeenCalledWith("token-old")
  })
})
