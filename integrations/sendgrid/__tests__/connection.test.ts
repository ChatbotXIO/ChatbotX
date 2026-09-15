import { afterEach, describe, expect, test, vi } from "vitest"
import { integration } from "../src/integration"

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

const connection = integration.connection
if (!connection?.fromCredentials) {
  throw new Error("sendGrid integration has no connection.fromCredentials")
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("sendGrid connection.fromCredentials", () => {
  test("live-validates the api key and returns a custom auth value", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ scopes: ["marketing.read"] })),
    )

    const auth = await connection.fromCredentials?.({ apiKey: " key " })

    expect(auth).toMatchObject({ authType: "custom", apiKey: "key" })
  })

  test("rejects a key missing marketing read scope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ scopes: [] })),
    )

    await expect(
      connection.fromCredentials?.({ apiKey: "key" }),
    ).rejects.toBeTruthy()
  })

  test("rejects an invalid api key by rethrowing the scopes failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({}, 401)),
    )

    await expect(
      connection.fromCredentials?.({ apiKey: "bad-key" }),
    ).rejects.toBeTruthy()
  })
})

describe("sendGrid connection.isRevokedTokenError", () => {
  test("is a real predicate, not a stub", () => {
    expect(connection.isRevokedTokenError({ statusCode: 401 })).toBe(true)
    expect(connection.isRevokedTokenError({ statusCode: 403 })).toBe(true)
    expect(connection.isRevokedTokenError({ statusCode: 500 })).toBe(false)
  })
})
