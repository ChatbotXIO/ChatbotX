import { jsonResponse } from "@chatbotx.io/vitest-config/test-utils"
import { afterEach, describe, expect, test, vi } from "vitest"
import { integration } from "../src/integration"

const connection = integration.connection
if (!connection?.fromCredentials) {
  throw new Error("mailchimp integration has no connection.fromCredentials")
}
const { fromCredentials } = connection

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("mailchimp connection.fromCredentials", () => {
  test("live-validates the api key and returns a custom auth value", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ health_status: "ok" }))
    vi.stubGlobal("fetch", fetchMock)

    const auth = await fromCredentials({
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
      fromCredentials({ apiKey: "bad-key-us1" }),
    ).rejects.toMatchObject({
      statusCode: 401,
    })
  })
})

describe("mailchimp connection.verify", () => {
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
})
