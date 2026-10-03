import { afterEach, describe, expect, test, vi } from "vitest"
import { integration } from "../src/integration"
import { jsonResponse } from "./test-utils"

const fromCredentials = integration.connection?.fromCredentials
if (!fromCredentials) {
  throw new Error("sendGrid integration has no connection.fromCredentials")
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("sendGrid connection.fromCredentials", () => {
  test("live-validates the api key and returns a custom auth value", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ scopes: ["marketing.read"] })),
    )

    const auth = await fromCredentials({ apiKey: " key " })

    expect(auth).toMatchObject({ authType: "custom", apiKey: "key" })
  })

  test("rejects a key missing marketing read scope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ scopes: [] })),
    )

    await expect(fromCredentials({ apiKey: "key" })).rejects.toThrow(
      "missing required scopes: marketing.read",
    )
  })

  test("rejects an invalid api key by rethrowing the scopes failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({}, 401)),
    )

    await expect(fromCredentials({ apiKey: "bad-key" })).rejects.toMatchObject({
      statusCode: 401,
    })
  })
})
