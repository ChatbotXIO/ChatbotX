import type { Context } from "@chatbotx.io/sdk"
import { afterEach, describe, expect, test, vi } from "vitest"
import { integration } from "../src/integration"
import { createKlaviyoAuth, type KlaviyoAuthValue } from "../src/schemas"

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

const createContext = (auth: KlaviyoAuthValue): Context<KlaviyoAuthValue> => ({
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

const page = (data: unknown[], next: string | null = null) => ({
  data,
  links: { next },
})

const resource = (id: string, name: string) => ({
  type: "list",
  id,
  attributes: { name },
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Klaviyo integration", () => {
  test("validates credentials with an empty lists page", async () => {
    const fetchMock = vi.fn(async (_request: Request) => jsonResponse(page([])))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      integration.runAction("validateCredentials", {
        props: { apiKey: " key " },
      }),
    ).resolves.toEqual({ authType: "custom", apiKey: "key" })

    const request = fetchMock.mock.calls[0]?.[0] as Request
    expect(request.url).toContain("/lists?")
    expect(request.url).toContain("page%5Bsize%5D=1")
  })

  test("maps lists with encoded cursor pagination", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          page(
            [resource("list-1", "Customers")],
            "https://a.klaviyo.com/api/lists?page%5Bcursor%5D=next-list",
          ),
        ),
      )
    vi.stubGlobal("fetch", fetchMock)
    const ctx = createContext(createKlaviyoAuth("key"))

    await expect(
      integration.runAction("listLists", {
        ctx,
        props: { cursor: "current-list", size: 10 },
      }),
    ).resolves.toEqual({
      data: [{ id: "list-1", name: "Customers" }],
      nextCursor: "next-list",
    })
    expect((fetchMock.mock.calls[0]?.[0] as Request).url).toContain(
      "page%5Bcursor%5D=current-list",
    )
  })

  test("rejects list page sizes above the provider limit", async () => {
    const ctx = createContext(createKlaviyoAuth("key"))

    await expect(
      integration.runAction("listLists", {
        ctx,
        props: { size: 11 },
      }),
    ).rejects.toThrow()
  })

  test("syncs a profile and list in sequence", async () => {
    const requests: Array<{ url: string; body: unknown }> = []
    const fetchMock = vi.fn(async (request: Request) => {
      requests.push({ url: request.url, body: await request.clone().json() })
      if (request.url.endsWith("/profile-import")) {
        return jsonResponse(
          {
            data: {
              type: "profile",
              id: "profile-1",
              attributes: { email: "a@example.com" },
            },
          },
          201,
        )
      }
      return new Response(undefined, { status: 204 })
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      integration.runAction("syncProfile", {
        ctx: createContext(createKlaviyoAuth("key")),
        props: {
          email: " A@Example.com ",
          first_name: "Ada",
          phone_number: "+84901234567",
          properties: { Plan: "Pro" },
          listId: "list-1",
        },
      }),
    ).resolves.toEqual({
      profileId: "profile-1",
      email: "a@example.com",
    })

    expect(requests).toEqual([
      {
        url: "https://a.klaviyo.com/api/profile-import",
        body: {
          data: {
            type: "profile",
            attributes: {
              email: "a@example.com",
              first_name: "Ada",
              phone_number: "+84901234567",
              properties: { Plan: "Pro" },
            },
          },
        },
      },
      {
        url: "https://a.klaviyo.com/api/lists/list-1/relationships/profiles",
        body: { data: [{ type: "profile", id: "profile-1" }] },
      },
    ])
  })

  test("omits optional relationships and propagates non-idempotent errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            type: "profile",
            id: "profile-1",
            attributes: { email: "a@example.com" },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            type: "profile",
            id: "profile-1",
            attributes: { email: "a@example.com" },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ errors: [{ detail: "List is unavailable" }] }, 400),
      )
    vi.stubGlobal("fetch", fetchMock)
    const ctx = createContext(createKlaviyoAuth("key"))

    await expect(
      integration.runAction("syncProfile", {
        ctx,
        props: { email: "a@example.com" },
      }),
    ).resolves.toEqual({
      profileId: "profile-1",
      email: "a@example.com",
    })
    await expect(
      integration.runAction("syncProfile", {
        ctx,
        props: { email: "a@example.com", listId: "list-1" },
      }),
    ).rejects.toMatchObject({ message: "List is unavailable", statusCode: 400 })
  })

  test("rejects unexpected success statuses when adding a profile to a list", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            type: "profile",
            id: "profile-1",
            attributes: { email: "a@example.com" },
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: [] }, 200))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      integration.runAction("syncProfile", {
        ctx: createContext(createKlaviyoAuth("key")),
        props: {
          email: "a@example.com",
          listId: "list-1",
        },
      }),
    ).rejects.toMatchObject({ statusCode: 200 })
  })
})
