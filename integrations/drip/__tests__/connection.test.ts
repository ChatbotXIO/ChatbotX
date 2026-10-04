import { jsonResponse } from "@chatbotx.io/vitest-config/test-utils"
import { afterEach, describe, expect, test, vi } from "vitest"
import { integration } from "../src/integration"

const fromCredentials = integration.connection?.fromCredentials
if (!fromCredentials) {
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

    const auth = await fromCredentials({ apiToken: " token " })

    expect(auth).toMatchObject({ authType: "custom", apiToken: "token" })
  })

  test("rejects a token with no accessible account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ accounts: [] })),
    )

    await expect(fromCredentials({ apiToken: "token" })).rejects.toThrow(
      "does not have access to an account",
    )
  })

  test("rejects an invalid token by rethrowing the accounts failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({}, 401)),
    )

    await expect(
      fromCredentials({ apiToken: "bad-token" }),
    ).rejects.toMatchObject({ statusCode: 401 })
  })
})
