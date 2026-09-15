import { afterEach, describe, expect, test, vi } from "vitest"
import { integration } from "../src/integration"

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

const connection = integration.connection
if (!connection?.fromCredentials) {
  throw new Error("mailchimp integration has no connection.fromCredentials")
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("mailchimp connection.fromCredentials", () => {
  test("live-validates the api key and returns a custom auth value", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ health_status: "ok" }))
    vi.stubGlobal("fetch", fetchMock)

    const auth = await integration.connection?.fromCredentials?.({
      apiKey: " key-us1 ",
    })

    expect(auth).toMatchObject({ authType: "custom", apiKey: "key-us1" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test("rejects an invalid api key by rethrowing the ping failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ status: 401, title: "Invalid key" }, 401),
      ),
    )

    await expect(
      integration.connection?.fromCredentials?.({ apiKey: "bad-key" }),
    ).rejects.toBeTruthy()
  })
})

describe("mailchimp connection.verify / isRevokedTokenError", () => {
  test("verify reports revoked:true on a 401 from the ping endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ status: 401, title: "Invalid key" }, 401),
      ),
    )

    const health = await connection.verify({
      auth: { authType: "custom", apiKey: "key", dataCenter: "us1" } as never,
    })
    expect(health).toMatchObject({ ok: false, revoked: true })
  })

  test("isRevokedTokenError is a real predicate, not a stub", () => {
    expect(connection.isRevokedTokenError({ statusCode: 401 })).toBe(true)
    expect(connection.isRevokedTokenError({ statusCode: 500 })).toBe(false)
  })
})
