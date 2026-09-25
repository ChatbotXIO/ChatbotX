import type { Context } from "@chatbotx.io/sdk"
import { afterEach, describe, expect, test, vi } from "vitest"
import { integration } from "../src/integration"
import {
  createGetResponseAuth,
  type GetResponseAuthValue,
} from "../src/schemas"

const jsonResponse = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })

const createContext = (
  auth: GetResponseAuthValue,
): Context<GetResponseAuthValue> => ({
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

describe("GetResponse integration", () => {
  test("validates credentials against accounts and returns normalized auth", async () => {
    const fetchMock = vi.fn(async (_request: Request) =>
      jsonResponse({
        accountId: "account-1",
        login: "workspace",
        email: "owner@example.com",
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      integration.runAction("validateCredentials", {
        props: { apiKey: " key " },
      }),
    ).resolves.toEqual({ authType: "custom", apiKey: "key" })

    const request = fetchMock.mock.calls[0]?.[0] as Request
    expect(request.url).toBe("https://api.getresponse.com/v3/accounts")
  })

  test("maps campaigns and tags pagination from X-Total-Count", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          [{ campaignId: "campaign-1", name: "Customers", href: "ignored" }],
          200,
          { "X-Total-Count": "250" },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse([{ tagId: "tag-1", name: "VIP", color: "ignored" }], 200, {
          "X-Total-Count": "1",
        }),
      )
    vi.stubGlobal("fetch", fetchMock)
    const ctx = createContext(createGetResponseAuth("key"))

    await expect(
      integration.runAction("listCampaigns", {
        ctx,
        props: { page: 2, perPage: 100 },
      }),
    ).resolves.toEqual({
      data: [{ campaignId: "campaign-1", name: "Customers", href: "ignored" }],
      meta: { currentPage: 2, lastPage: 3, perPage: 100, total: 250 },
    })
    await expect(
      integration.runAction("listTags", {
        ctx,
        props: { page: 1, perPage: 1000 },
      }),
    ).resolves.toEqual({
      data: [{ tagId: "tag-1", name: "VIP", color: "ignored" }],
      meta: { currentPage: 1, lastPage: 1, perPage: 1000, total: 1 },
    })

    const campaignsRequest = fetchMock.mock.calls[0]?.[0] as Request
    expect(campaignsRequest.url).toBe(
      "https://api.getresponse.com/v3/campaigns?page=2&perPage=100",
    )
    expect((fetchMock.mock.calls[1]?.[0] as Request).url).toBe(
      "https://api.getresponse.com/v3/tags?page=1&perPage=1000",
    )
  })

  test("falls back pagination meta when X-Total-Count is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse([{ campaignId: "campaign-1", name: "Customers" }]),
      ),
    )
    const ctx = createContext(createGetResponseAuth("key"))

    await expect(
      integration.runAction("listCampaigns", {
        ctx,
        props: { page: 1, perPage: 100 },
      }),
    ).resolves.toEqual({
      data: [{ campaignId: "campaign-1", name: "Customers" }],
      meta: { currentPage: 1, lastPage: 1, perPage: 100, total: 1 },
    })
  })

  test("normalizes contact payload and omits empty optional properties", async () => {
    let body: unknown
    const fetchMock = vi.fn(async (request: Request) => {
      body = await request.clone().json()
      return new Response(null, { status: 202 })
    })
    vi.stubGlobal("fetch", fetchMock)
    const ctx = createContext(createGetResponseAuth("key"))

    await integration.runAction("createOrUpdateContact", {
      ctx,
      props: {
        email: " Person@Example.com ",
        name: "Al",
        campaign: { campaignId: "campaign-1" },
        tags: [],
      },
    })

    expect(body).toEqual({
      email: "person@example.com",
      campaign: { campaignId: "campaign-1" },
    })
    expect(body).not.toHaveProperty("customFieldValues")
  })

  test("sends name, tags, and dayOfCycle exactly when present", async () => {
    let body: unknown
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: Request) => {
        body = await request.clone().json()
        return new Response(null, { status: 202 })
      }),
    )
    const ctx = createContext(createGetResponseAuth("key"))

    await integration.runAction("createOrUpdateContact", {
      ctx,
      props: {
        email: "person@example.com",
        name: "Ada Lovelace",
        campaign: { campaignId: "campaign-1" },
        tags: [{ tagId: "tag-1" }, { tagId: "tag-2" }],
        dayOfCycle: 0,
      },
    })

    expect(body).toEqual({
      email: "person@example.com",
      name: "Ada Lovelace",
      campaign: { campaignId: "campaign-1" },
      tags: [{ tagId: "tag-1" }, { tagId: "tag-2" }],
      dayOfCycle: 0,
    })
    expect(body).not.toHaveProperty("customFieldValues")
  })
})
