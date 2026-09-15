import { afterEach, describe, expect, test, vi } from "vitest"
import { integration } from "../src/integration"

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

const connection = integration.connection
if (!connection?.fromCredentials) {
  throw new Error("mailerLite integration has no connection.fromCredentials")
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("mailerLite connection.fromCredentials", () => {
  test("live-validates the api key and returns a custom auth value", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [],
        meta: { current_page: 1, last_page: 1, per_page: 1, total: 0 },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const auth = await connection.fromCredentials?.({ apiKey: " key " })

    expect(auth).toMatchObject({ authType: "custom", apiKey: "key" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test("rejects an invalid api key by rethrowing the groups-page failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({}, 401)),
    )

    await expect(
      connection.fromCredentials?.({ apiKey: "bad-key" }),
    ).rejects.toBeTruthy()
  })
})

describe("mailerLite connection.isRevokedTokenError", () => {
  test("is a real predicate, not a stub", () => {
    expect(connection.isRevokedTokenError({ statusCode: 401 })).toBe(true)
    expect(connection.isRevokedTokenError({ statusCode: 403 })).toBe(true)
    expect(connection.isRevokedTokenError({ statusCode: 500 })).toBe(false)
  })
})
