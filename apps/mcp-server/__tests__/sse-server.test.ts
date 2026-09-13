import type { IncomingMessage } from "node:http"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// Dynamic per-test `import()` (not a static top-level import) matches this
// repo's existing `openapi-loader.test.ts` convention: `sse-server.ts`
// reads `env` from `@t3-oss/env-core` at module-eval time, so a test that
// mutates `process.env.CHATBOTX_API_KEY` must pair `vi.resetModules()`
// with a fresh import to see it — a static import would read `env` once,
// frozen at the first test's `process.env`, for the whole file.

const fakeRequest = (props: {
  url?: string
  headers?: Record<string, string | string[]>
}): IncomingMessage =>
  ({
    url: props.url ?? "/sse",
    headers: props.headers ?? {},
  }) as unknown as IncomingMessage

describe("resolveHeaderValue", () => {
  test("returns a trimmed string header as-is", async () => {
    const { resolveHeaderValue } = await import("../src/server/sse-server")
    expect(resolveHeaderValue("  abc123  ")).toBe("abc123")
  })

  test("returns the first non-empty entry of an array header", async () => {
    const { resolveHeaderValue } = await import("../src/server/sse-server")
    expect(resolveHeaderValue(["", "  ", "abc123"])).toBe("abc123")
  })

  test("returns empty string for undefined", async () => {
    const { resolveHeaderValue } = await import("../src/server/sse-server")
    expect(resolveHeaderValue(undefined)).toBe("")
  })
})

describe("getApiTokenFromRequest — priority order", () => {
  test("?workspace_token= wins over everything else", async () => {
    const { getApiTokenFromRequest } = await import("../src/server/sse-server")
    const req = fakeRequest({
      url: "/sse?workspace_token=from-query&token=ignored",
      headers: {
        "x-workspace-token": "ignored-header",
        "x-chatbo-token": "ignored-header-2",
      },
    })
    expect(getApiTokenFromRequest(req)).toBe("from-query")
  })

  test("?token= is used when workspace_token is absent", async () => {
    const { getApiTokenFromRequest } = await import("../src/server/sse-server")
    const req = fakeRequest({ url: "/sse?token=legacy-query" })
    expect(getApiTokenFromRequest(req)).toBe("legacy-query")
  })

  test("x-workspace-token header wins over x-chatbo-token", async () => {
    const { getApiTokenFromRequest } = await import("../src/server/sse-server")
    const req = fakeRequest({
      headers: {
        "x-workspace-token": "primary-header",
        "x-chatbo-token": "fallback-header",
      },
    })
    expect(getApiTokenFromRequest(req)).toBe("primary-header")
  })

  test("x-chatbo-token is used when x-workspace-token is absent", async () => {
    const { getApiTokenFromRequest } = await import("../src/server/sse-server")
    const req = fakeRequest({
      headers: { "x-chatbo-token": "fallback-header" },
    })
    expect(getApiTokenFromRequest(req)).toBe("fallback-header")
  })

  test("returns undefined when the request carries no token", async () => {
    const { getApiTokenFromRequest } = await import("../src/server/sse-server")
    expect(getApiTokenFromRequest(fakeRequest({}))).toBeUndefined()
  })
})

describe("makeApiKeyState / updateApiKeyStateFromRequest", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    process.env.CHATBOTX_API_KEY = "env-default-token"
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  test("falls back to CHATBOTX_API_KEY when the connect request carries no token", async () => {
    const { makeApiKeyState } = await import("../src/server/sse-server")
    const state = makeApiKeyState(fakeRequest({}))
    expect(state.current).toBe("env-default-token")
  })

  test("seeds state from the connect request's token when present", async () => {
    const { makeApiKeyState } = await import("../src/server/sse-server")
    const state = makeApiKeyState(
      fakeRequest({ url: "/sse?workspace_token=connect-token" }),
    )
    expect(state.current).toBe("connect-token")
  })

  test("a later request carrying a token overwrites the session's current token", async () => {
    const { makeApiKeyState, updateApiKeyStateFromRequest } = await import(
      "../src/server/sse-server"
    )
    const state = makeApiKeyState(
      fakeRequest({ url: "/sse?workspace_token=token-a" }),
    )
    expect(state.current).toBe("token-a")

    updateApiKeyStateFromRequest(
      state,
      fakeRequest({ headers: { "x-workspace-token": "token-b" } }),
    )
    expect(state.current).toBe("token-b")
  })

  test("a later request carrying no token leaves the current token untouched", async () => {
    const { makeApiKeyState, updateApiKeyStateFromRequest } = await import(
      "../src/server/sse-server"
    )
    const state = makeApiKeyState(
      fakeRequest({ url: "/sse?workspace_token=token-a" }),
    )

    updateApiKeyStateFromRequest(state, fakeRequest({}))
    expect(state.current).toBe("token-a")
  })
})
