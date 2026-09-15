import { afterEach, describe, expect, test, vi } from "vitest"
import { integration } from "../src/integration"

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

const connection = integration.connection
if (!connection?.fromCredentials) {
  throw new Error(
    "activeCampaign integration has no connection.fromCredentials",
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("activeCampaign connection.fromCredentials", () => {
  test("live-validates the credential and returns a custom auth value", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ accounts: [] })),
    )

    const auth = await connection.fromCredentials?.({
      apiUrl: "https://example.api-us1.com/api/3/",
      apiKey: " key ",
    })

    expect(auth).toMatchObject({ authType: "custom" })
  })

  test("rejects an invalid credential by rethrowing the accounts failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({}, 401)),
    )

    await expect(
      connection.fromCredentials?.({
        apiUrl: "https://example.api-us1.com/api/3/",
        apiKey: "bad-key",
      }),
    ).rejects.toBeTruthy()
  })
})

describe("activeCampaign connection.isRevokedTokenError", () => {
  test("is a real predicate, not a stub", () => {
    expect(connection.isRevokedTokenError({ statusCode: 401 })).toBe(true)
    expect(connection.isRevokedTokenError({ statusCode: 403 })).toBe(true)
    expect(connection.isRevokedTokenError({ statusCode: 500 })).toBe(false)
  })
})
