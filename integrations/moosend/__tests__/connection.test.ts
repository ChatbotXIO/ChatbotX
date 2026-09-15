import { afterEach, describe, expect, test, vi } from "vitest"
import { integration } from "../src/integration"

const listResponse = (mailingLists: unknown[] = []) => ({
  Code: 0,
  Error: null,
  Context: {
    Paging: {
      PageSize: 1,
      CurrentPage: 1,
      TotalResults: mailingLists.length,
      TotalPageCount: mailingLists.length > 0 ? 1 : 0,
    },
    MailingLists: mailingLists,
  },
})

const errorResponse = (code: number) => ({
  Code: code,
  Error: "Invalid ApiKey",
  Context: null,
})

const connection = integration.connection
if (!connection?.fromCredentials) {
  throw new Error("moosend integration has no connection.fromCredentials")
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("moosend connection.fromCredentials", () => {
  test("live-validates the api key and returns a custom auth value", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(listResponse())),
    )

    const auth = await connection.fromCredentials?.({ apiKey: " key " })

    expect(auth).toMatchObject({ authType: "custom", apiKey: "key" })
  })

  test("rejects an invalid api key by rethrowing the lists failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(errorResponse(1), { status: 401 })),
    )

    await expect(
      connection.fromCredentials?.({ apiKey: "bad-key" }),
    ).rejects.toBeTruthy()
  })
})
