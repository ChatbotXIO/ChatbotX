import { afterEach, describe, expect, test, vi } from "vitest"
import { integration } from "../src/integration"
import { jsonResponse } from "./test-utils"

const fromCredentials = integration.connection?.fromCredentials
if (!fromCredentials) {
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

    const auth = await fromCredentials({ apiKey: " key " })

    expect(auth).toMatchObject({ authType: "custom", apiKey: "key" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test("rejects an invalid api key by rethrowing the groups-page failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({}, 401)),
    )

    await expect(fromCredentials({ apiKey: "bad-key" })).rejects.toMatchObject({
      statusCode: 401,
    })
  })
})
