import { jsonResponse } from "@chatbotx.io/vitest-config/test-utils"
import { afterEach, describe, expect, test, vi } from "vitest"
import { integration } from "../src/integration"

const fromCredentials = integration.connection?.fromCredentials
if (!fromCredentials) {
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

    const auth = await fromCredentials({ apiKey: " key " })

    expect(auth).toMatchObject({ authType: "custom", apiKey: "key" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test("rejects an invalid api key by rethrowing the list-page failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ errors: [] }, 401)),
    )

    await expect(fromCredentials({ apiKey: "bad-key" })).rejects.toMatchObject({
      statusCode: 401,
    })
  })
})
