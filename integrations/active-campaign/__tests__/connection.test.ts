import { jsonResponse } from "@chatbotx.io/vitest-config/test-utils"
import { afterEach, describe, expect, test, vi } from "vitest"
import { integration } from "../src/integration"

const fromCredentials = integration.connection?.fromCredentials
if (!fromCredentials) {
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

    const auth = await fromCredentials({
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
      fromCredentials({
        apiUrl: "https://example.api-us1.com/api/3/",
        apiKey: "bad-key",
      }),
    ).rejects.toMatchObject({ statusCode: 401 })
  })
})
