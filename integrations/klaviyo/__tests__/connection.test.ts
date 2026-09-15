import { afterEach, describe, expect, test, vi } from "vitest"
import { integration } from "../src/integration"

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

const connection = integration.connection
if (!connection?.fromCredentials) {
  throw new Error("klaviyo integration has no connection.fromCredentials")
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("klaviyo connection.fromCredentials", () => {
  test("live-validates the api key and returns a custom auth value", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ data: [], links: { next: null } }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const auth = await connection.fromCredentials?.({ apiKey: " key " })

    expect(auth).toMatchObject({ authType: "custom", apiKey: "key" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test("rejects an invalid api key by rethrowing the list-page failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ errors: [] }, 401)),
    )

    await expect(
      connection.fromCredentials?.({ apiKey: "bad-key" }),
    ).rejects.toBeTruthy()
  })
})

describe("klaviyo connection.isRevokedTokenError", () => {
  test("is a real predicate, not a stub", () => {
    expect(connection.isRevokedTokenError({ statusCode: 401 })).toBe(true)
    expect(connection.isRevokedTokenError({ statusCode: 403 })).toBe(true)
    expect(connection.isRevokedTokenError({ statusCode: 500 })).toBe(false)
    expect(connection.isRevokedTokenError(new Error("boom"))).toBe(false)
  })
})
