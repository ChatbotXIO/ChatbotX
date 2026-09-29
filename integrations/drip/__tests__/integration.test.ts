import type { Context } from "@chatbotx.io/sdk"
import { afterEach, describe, expect, test, vi } from "vitest"
import { DripApiError } from "../src/error"
import { integration } from "../src/integration"
import { createDripAuth, type DripAuthValue } from "../src/schemas"

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

const createContext = (auth: DripAuthValue): Context<DripAuthValue> => ({
  auth,
  storagePrefix: "",
  platform: {
    appUrl: "",
    publicRealtimeUrl: "",
    internalRealtimeUrl: "",
    storageUrl: "",
    getRealtimeBroadcastAuthHeaders: async () => ({}),
  },
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Drip integration", () => {
  test("validates a token that can access multiple accounts", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        accounts: [
          { id: "123", name: "Main" },
          { id: "456", name: "Secondary" },
        ],
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const auth = await integration.runAction("validateCredentials", {
      props: { apiToken: " token " },
    })

    expect(auth).toEqual({
      authType: "custom",
      apiToken: "token",
    })
    const request = fetchMock.mock.calls[0]?.[0] as Request
    expect(request.url).toBe("https://api.getdrip.com/v2/accounts")
    expect(request.headers.get("Authorization")).toBe(
      `Basic ${Buffer.from("token:").toString("base64")}`,
    )
  })

  test("rejects tokens without an accessible account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ accounts: [] })),
    )

    await expect(
      integration.runAction("validateCredentials", {
        props: { apiToken: "token" },
      }),
    ).rejects.toThrow("does not have access to an account")
  })

  test("lists every account available to the token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          accounts: [
            { id: "1", name: "Primary" },
            { id: "2", name: "Secondary" },
          ],
        }),
      ),
    )
    const auth = createDripAuth("token")

    await expect(
      integration.runAction("listAccounts", {
        ctx: createContext(auth),
        props: {},
      }),
    ).resolves.toEqual([
      { id: "1", name: "Primary" },
      { id: "2", name: "Secondary" },
    ])
  })

  test("maps custom field identifier strings to stable resources", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ custom_field_identifiers: ["company", "plan"] }),
      ),
    )
    const auth = createDripAuth("token")

    await expect(
      integration.runAction("listCustomFields", {
        ctx: createContext(auth),
        props: { accountId: "123" },
      }),
    ).resolves.toEqual([
      { identifier: "company", label: "company" },
      { identifier: "plan", label: "plan" },
    ])
  })

  test("surfaces rate-limit metadata without retrying", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ errors: [{ message: "Slow down" }] }), {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "X-RateLimit-Limit": "3600",
            "X-RateLimit-Remaining": "0",
          },
        }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const auth = createDripAuth("token")

    const error = await integration
      .runAction("listTags", {
        ctx: createContext(auth),
        props: { accountId: "123" },
      })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(DripApiError)
    expect(error).toMatchObject({
      message: "Slow down",
      statusCode: 429,
      rateLimitLimit: 3600,
      rateLimitRemaining: 0,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test("omits empty optional subscriber fields", async () => {
    let requestBody: unknown
    const fetchMock = vi.fn(async (request: Request) => {
      requestBody = await request.clone().json()
      return jsonResponse({ subscribers: [] })
    })
    vi.stubGlobal("fetch", fetchMock)
    const auth = createDripAuth("token")

    await integration.runAction("syncSubscriber", {
      ctx: createContext(auth),
      props: { accountId: "123", email: "person@example.com" },
    })

    const request = fetchMock.mock.calls[0]?.[0] as Request
    expect(request.url).toBe("https://api.getdrip.com/v2/123/subscribers")
    expect(requestBody).toEqual({
      subscribers: [{ email: "person@example.com" }],
    })
  })
})
