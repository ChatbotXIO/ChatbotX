import type { Context } from "@chatbotx.io/sdk"
import { afterEach, describe, expect, test, vi } from "vitest"
import { integration } from "../src/integration"
import { createMoosendAuth, type MoosendAuthValue } from "../src/schemas"

const createContext = (auth: MoosendAuthValue): Context<MoosendAuthValue> => ({
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

const listResponse = (mailingLists: unknown[] = []) => ({
  Code: 0,
  Error: null,
  Context: {
    Paging: {
      PageSize: 20,
      CurrentPage: 1,
      TotalResults: mailingLists.length,
      TotalPageCount: mailingLists.length > 0 ? 1 : 0,
    },
    MailingLists: mailingLists,
  },
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Moosend integration", () => {
  test("validates trimmed credentials against a small empty list page", async () => {
    const fetchMock = vi.fn(async (_request: Request) =>
      Response.json(listResponse()),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      integration.runAction("validateCredentials", {
        props: { apiKey: " key " },
      }),
    ).resolves.toEqual({ authType: "custom", apiKey: "key" })

    expect(
      new URL((fetchMock.mock.calls[0]?.[0] as Request).url).pathname,
    ).toBe("/v3/lists/1/1.json")
  })

  test("maps mailing list identity and pagination", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          listResponse([{ ID: "list-1", Name: "Customers", Extra: true }]),
        ),
      ),
    )

    await expect(
      integration.runAction("listMailingLists", {
        ctx: createContext(createMoosendAuth("key")),
        props: { page: 1, pageSize: 20 },
      }),
    ).resolves.toEqual({
      data: [{ id: "list-1", name: "Customers" }],
      meta: {
        pageSize: 20,
        currentPage: 1,
        totalResults: 1,
        totalPageCount: 1,
      },
    })
  })

  test("normalizes email and omits unsupported fields", async () => {
    let body: unknown
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: Request) => {
        body = await request.clone().json()
        return Response.json({
          Code: 0,
          Error: null,
          Context: {
            ID: "subscriber-1",
            Email: "a@example.com",
            Name: null,
            SubscribeType: 1,
          },
        })
      }),
    )

    await expect(
      integration.runAction("createOrUpdateContact", {
        ctx: createContext(createMoosendAuth("key")),
        props: { listId: " list-1 ", email: " A@Example.com " },
      }),
    ).resolves.toEqual({
      id: "subscriber-1",
      email: "a@example.com",
      subscribeType: 1,
    })

    expect(body).toEqual({ Email: "a@example.com" })
    expect(body).not.toHaveProperty("HasExternalDoubleOptIn")
    expect(body).not.toHaveProperty("CustomFields")
  })

  test("requires a list ID", async () => {
    const ctx = createContext(createMoosendAuth("key"))

    await expect(
      integration.runAction("createOrUpdateContact", {
        ctx,
        props: { listId: " ", email: "a@example.com" },
      }),
    ).rejects.toThrow()
  })
})
