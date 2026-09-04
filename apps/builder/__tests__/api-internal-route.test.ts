// @vitest-environment node

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { handle, createOpenAPIHandler } = vi.hoisted(() => {
  const handle = vi.fn().mockResolvedValue({ response: new Response("ok") })
  return {
    handle,
    createOpenAPIHandler: vi.fn().mockReturnValue({ handle }),
  }
})

vi.mock("@/lib/orpc/handlers", () => ({ createOpenAPIHandler }))
vi.mock("@/routers", () => ({ router: {} }))
vi.mock("@/polyfill", () => ({}))

const { GET } = await import("../src/app/api-internal/[[...rest]]/route")

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("GET /api-internal/[[...rest]]", () => {
  test("404s outside development and never invokes the handler", async () => {
    vi.stubEnv("NODE_ENV", "production")

    const response = await GET(new Request("https://example.com/api-internal"))

    expect(response.status).toBe(404)
    expect(handle).not.toHaveBeenCalled()
  })

  test("404s in test env and never invokes the handler", async () => {
    vi.stubEnv("NODE_ENV", "test")

    const response = await GET(new Request("https://example.com/api-internal"))

    expect(response.status).toBe(404)
    expect(handle).not.toHaveBeenCalled()
  })

  test("invokes the handler in development", async () => {
    vi.stubEnv("NODE_ENV", "development")

    const response = await GET(new Request("https://example.com/api-internal"))

    expect(handle).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
  })
})
