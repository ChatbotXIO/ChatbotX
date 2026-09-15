import { afterEach, describe, expect, test, vi } from "vitest"
import { integration } from "../src/integration"

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

const connection = integration.connection
if (!connection?.fromCredentials) {
  throw new Error("drip integration has no connection.fromCredentials")
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("drip connection.fromCredentials", () => {
  test("live-validates the api token and returns a custom auth value", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ accounts: [{ id: "123", name: "Main" }] }),
      ),
    )

    const auth = await connection.fromCredentials?.({ apiToken: " token " })

    expect(auth).toMatchObject({ authType: "custom", apiToken: "token" })
  })

  test("rejects a token with no accessible account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ accounts: [] })),
    )

    await expect(
      connection.fromCredentials?.({ apiToken: "token" }),
    ).rejects.toBeTruthy()
  })

  test("rejects an invalid token by rethrowing the accounts failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({}, 401)),
    )

    await expect(
      connection.fromCredentials?.({ apiToken: "bad-token" }),
    ).rejects.toBeTruthy()
  })
})

describe("drip connection.isRevokedTokenError", () => {
  test("is a real predicate, not a stub", () => {
    expect(connection.isRevokedTokenError({ statusCode: 401 })).toBe(true)
    expect(connection.isRevokedTokenError({ statusCode: 403 })).toBe(true)
    expect(connection.isRevokedTokenError({ statusCode: 500 })).toBe(false)
  })
})
