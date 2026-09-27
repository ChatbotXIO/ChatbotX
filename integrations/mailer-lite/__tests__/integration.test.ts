import type { Context } from "@chatbotx.io/sdk"
import { afterEach, describe, expect, test, vi } from "vitest"
import { integration } from "../src/integration"
import { createMailerLiteAuth, type MailerLiteAuthValue } from "../src/schemas"

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

const createContext = (
  auth: MailerLiteAuthValue,
): Context<MailerLiteAuthValue> => ({
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

const page = (data: unknown[]) => ({
  data,
  links: { first: null, last: null, prev: null, next: null },
  meta: { current_page: 1, last_page: 1, per_page: 100, total: data.length },
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("MailerLite integration", () => {
  test("validates credentials with an empty groups page", async () => {
    const fetchMock = vi.fn(async (_request: Request) => jsonResponse(page([])))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      integration.runAction("validateCredentials", {
        props: { apiKey: " key " },
      }),
    ).resolves.toEqual({ authType: "custom", apiKey: "key" })

    const request = fetchMock.mock.calls[0]?.[0] as Request
    expect(request.url).toContain("/groups?")
    expect(request.url).toContain("page=1")
    expect(request.url).toContain("limit=1")
  })

  test("maps groups and fields pagination", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          page([{ id: "group-1", name: "Customers", active_count: 2 }]),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          page([{ id: "field-1", name: "Plan", key: "plan", type: "text" }]),
        ),
      )
    vi.stubGlobal("fetch", fetchMock)
    const ctx = createContext(createMailerLiteAuth("key"))

    await expect(
      integration.runAction("listGroups", {
        ctx,
        props: { page: 2, limit: 100 },
      }),
    ).resolves.toEqual({
      data: [{ id: "group-1", name: "Customers" }],
      meta: { currentPage: 1, lastPage: 1, perPage: 100, total: 1 },
    })
    await expect(
      integration.runAction("listFields", {
        ctx,
        props: { page: 1, limit: 100 },
      }),
    ).resolves.toEqual({
      data: [{ id: "field-1", name: "Plan", key: "plan", type: "text" }],
      meta: { currentPage: 1, lastPage: 1, perPage: 100, total: 1 },
    })

    const groupsRequest = fetchMock.mock.calls[0]?.[0] as Request
    expect(groupsRequest.url).toContain("page=2")
    expect(groupsRequest.url).toContain("limit=100")
    expect((fetchMock.mock.calls[1]?.[0] as Request).url).toContain("/fields?")
  })

  test("normalizes email and omits empty optional subscriber properties", async () => {
    let body: unknown
    const fetchMock = vi.fn(async (request: Request) => {
      body = await request.clone().json()
      return jsonResponse(
        {
          data: {
            id: "subscriber-1",
            email: "a@example.com",
            status: "unconfirmed",
            fields: {},
          },
        },
        201,
      )
    })
    vi.stubGlobal("fetch", fetchMock)
    const ctx = createContext(createMailerLiteAuth("key"))

    await integration.runAction("createOrUpdateSubscriber", {
      ctx,
      props: {
        email: " A@Example.com ",
        status: "unconfirmed",
      },
    })

    expect(body).toEqual({
      email: "a@example.com",
      status: "unconfirmed",
    })
  })

  test("sends selected group, fields, and status exactly", async () => {
    let body: unknown
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: Request) => {
        body = await request.clone().json()
        return jsonResponse({
          data: {
            id: "subscriber-1",
            email: "a@example.com",
            status: "active",
            fields: { plan: "Pro" },
            groups: [{ id: "group-1" }],
          },
        })
      }),
    )
    const ctx = createContext(createMailerLiteAuth("key"))

    await integration.runAction("createOrUpdateSubscriber", {
      ctx,
      props: {
        email: "a@example.com",
        fields: { plan: "Pro" },
        groups: ["group-1"],
        status: "active",
      },
    })

    expect(body).toEqual({
      email: "a@example.com",
      fields: { plan: "Pro" },
      groups: ["group-1"],
      status: "active",
    })
    expect(body).not.toHaveProperty("autoresponders")
    expect(body).not.toHaveProperty("resubscribe")
  })
})
