// @vitest-environment node

import { NextRequest } from "next/server"
import { afterEach, describe, expect, test, vi } from "vitest"

vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}))

vi.mock("better-auth/cookies", () => ({
  getSessionCookie: vi.fn(() => null),
}))

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}))

vi.mock("@/lib/log", () => ({
  httpLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const originalForcePublicHttps = process.env.FORCE_PUBLIC_HTTPS

afterEach(() => {
  if (originalForcePublicHttps === undefined) {
    delete process.env.FORCE_PUBLIC_HTTPS
  } else {
    process.env.FORCE_PUBLIC_HTTPS = originalForcePublicHttps
  }
})

/**
 * `/api` is a public route, so `proxy` reaches `attachProxyUrl` without
 * touching the session. `NextResponse.next({ request: { headers } })` exposes
 * the overridden request headers as `x-middleware-request-<name>`.
 */
async function proxyUrlFor(publicHost: string, requestUrl: string) {
  delete process.env.FORCE_PUBLIC_HTTPS
  const { proxy } = await import("@/proxy")
  const response = await proxy(
    new NextRequest(requestUrl, {
      headers: { "x-forwarded-host": publicHost },
    }),
  )
  return response.headers.get("x-middleware-request-x-url")
}

describe("proxy x-url", () => {
  test("keeps the port when the public host carries one", async () => {
    expect(
      await proxyUrlFor("localhost:3123", "http://internal.test:3000/api/x"),
    ).toBe("http://localhost:3123/api/x")
  })

  test("drops the internal port when the public host carries none", async () => {
    expect(
      await proxyUrlFor("app.example.com", "http://internal.test:3000/api/x"),
    ).toBe("http://app.example.com/api/x")
  })

  test("does not mistake a bracketed IPv6 host for one carrying a port", async () => {
    expect(await proxyUrlFor("[::1]", "http://internal.test:3000/api/x")).toBe(
      "http://[::1]/api/x",
    )
  })

  test("keeps the port of a bracketed IPv6 host that carries one", async () => {
    expect(
      await proxyUrlFor("[::1]:3123", "http://internal.test:3000/api/x"),
    ).toBe("http://[::1]:3123/api/x")
  })
})
