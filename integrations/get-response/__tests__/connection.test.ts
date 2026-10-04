import { jsonResponse } from "@chatbotx.io/vitest-config/test-utils"
import { afterEach, describe, expect, test, vi } from "vitest"
import { integration } from "../src/integration"

const fromCredentials = integration.connection?.fromCredentials
if (!fromCredentials) {
  throw new Error("getResponse integration has no connection.fromCredentials")
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("getResponse connection.fromCredentials", () => {
  test("live-validates the api key and returns a custom auth value", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          accountId: "account-1",
          login: "workspace",
          email: "owner@example.com",
        }),
      ),
    )

    const auth = await fromCredentials({ apiKey: " key " })

    expect(auth).toMatchObject({ authType: "custom" })
  })

  test("rejects an invalid api key by rethrowing the accounts failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({}, 401)),
    )

    await expect(fromCredentials({ apiKey: "bad-key" })).rejects.toMatchObject({
      statusCode: 401,
    })
  })
})
