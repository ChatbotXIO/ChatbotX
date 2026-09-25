import type { Context } from "@chatbotx.io/sdk"
import { afterEach, describe, expect, test, vi } from "vitest"
import { ActiveCampaignApiError } from "../src/error"
import { integration } from "../src/integration"
import {
  type ActiveCampaignAuthValue,
  createActiveCampaignAuth,
} from "../src/schemas"

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

const createContext = (
  auth: ActiveCampaignAuthValue,
): Context<ActiveCampaignAuthValue> => ({
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

describe("ActiveCampaign integration", () => {
  test("validates credentials with Api-Token and normalized API URL", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ accounts: [] }))
    vi.stubGlobal("fetch", fetchMock)

    const auth = await integration.runAction("validateCredentials", {
      props: {
        apiUrl: "https://example.api-us1.com/api/3/",
        apiKey: " key ",
      },
    })

    expect(auth).toEqual({
      authType: "custom",
      apiUrl: "https://example.api-us1.com",
      apiKey: "key",
    })
    const request = fetchMock.mock.calls[0]?.[0] as Request
    expect(request.url).toBe("https://example.api-us1.com/api/3/accounts")
    expect(request.headers.get("Api-Token")).toBe("key")
    expect(request.headers.get("Accept")).toBe("application/json")
  })

  test("lists lists, tags and custom fields as stable resources", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ lists: [{ id: "1", name: "Newsletter" }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ tags: [{ id: "2", tag: "Customer" }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ fields: [{ id: "3", title: "Plan" }] }),
      )
    vi.stubGlobal("fetch", fetchMock)
    const ctx = createContext(
      createActiveCampaignAuth({
        apiUrl: "https://example.api-us1.com",
        apiKey: "key",
      }),
    )

    await expect(
      integration.runAction("listLists", { ctx, props: {} }),
    ).resolves.toEqual([{ id: "1", name: "Newsletter" }])
    await expect(
      integration.runAction("listTags", { ctx, props: {} }),
    ).resolves.toEqual([{ id: "2", tag: "Customer" }])
    await expect(
      integration.runAction("listCustomFields", { ctx, props: {} }),
    ).resolves.toEqual([{ id: "3", label: "Plan" }])
  })

  test("syncs a contact and omits empty optional fields", async () => {
    let requestBody: unknown
    const fetchMock = vi.fn(async (request: Request) => {
      requestBody = await request.clone().json()
      return jsonResponse({
        contact: { id: "123", email: "person@example.com" },
      })
    })
    vi.stubGlobal("fetch", fetchMock)
    const ctx = createContext(
      createActiveCampaignAuth({
        apiUrl: "https://example.api-us1.com",
        apiKey: "key",
      }),
    )

    await expect(
      integration.runAction("syncContact", {
        ctx,
        props: {
          email: "person@example.com",
          firstName: "Ada",
        },
      }),
    ).resolves.toEqual({ id: "123", email: "person@example.com" })

    const request = fetchMock.mock.calls[0]?.[0] as Request
    expect(request.url).toBe("https://example.api-us1.com/api/3/contact/sync")
    expect(requestBody).toEqual({
      contact: {
        email: "person@example.com",
        firstName: "Ada",
      },
    })
  })

  test("posts list and tag mutations with provider IDs", async () => {
    const requestBodies: unknown[] = []
    const fetchMock = vi.fn(async (request: Request) => {
      requestBodies.push(await request.clone().json())
      return jsonResponse({})
    })
    vi.stubGlobal("fetch", fetchMock)
    const ctx = createContext(
      createActiveCampaignAuth({
        apiUrl: "https://example.api-us1.com",
        apiKey: "key",
      }),
    )

    await integration.runAction("addContactToList", {
      ctx,
      props: { contactId: "123", listId: "5", status: "1" },
    })
    await integration.runAction("addTagToContact", {
      ctx,
      props: { contactId: "123", tagId: "7" },
    })

    expect(requestBodies).toEqual([
      { contactList: { contact: "123", list: "5", status: "1" } },
      { contactTag: { contact: "123", tag: "7" } },
    ])
  })

  test("skips automation add when contact is already associated", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        contactAutomations: [
          { id: "1", contact: "123", automation: "42", seriesid: "42" },
        ],
      }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const ctx = createContext(
      createActiveCampaignAuth({
        apiUrl: "https://example.api-us1.com",
        apiKey: "key",
      }),
    )

    await expect(
      integration.runAction("addContactToAutomation", {
        ctx,
        props: { contactId: "123", automationId: "42" },
      }),
    ).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = fetchMock.mock.calls[0]?.[0] as Request
    expect(request.method).toBe("GET")
    expect(request.url).toBe(
      "https://example.api-us1.com/api/3/contacts/123/contactAutomations",
    )
  })

  test("treats subscriber-series conflicts as success without a second lookup", async () => {
    let postBody: unknown
    const fetchMock = vi.fn(async (request: Request) => {
      if (request.method === "POST") {
        postBody = await request.clone().json()
        return jsonResponse(
          {
            errors: [
              { status: "422", detail: "Could not create SubscriberSeries" },
            ],
          },
          422,
        )
      }

      return jsonResponse({ contactAutomations: [] })
    })
    vi.stubGlobal("fetch", fetchMock)
    const ctx = createContext(
      createActiveCampaignAuth({
        apiUrl: "https://example.api-us1.com",
        apiKey: "key",
      }),
    )

    await expect(
      integration.runAction("addContactToAutomation", {
        ctx,
        props: { contactId: "123", automationId: "42" },
      }),
    ).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const postRequest = fetchMock.mock.calls[1]?.[0] as Request
    expect(postRequest.method).toBe("POST")
    expect(postBody).toEqual({
      contactAutomation: { contact: "123", automation: "42" },
    })
  })

  test("surfaces provider errors without retrying", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ message: "Invalid credentials" }, 401),
    )
    vi.stubGlobal("fetch", fetchMock)
    const ctx = createContext(
      createActiveCampaignAuth({
        apiUrl: "https://example.api-us1.com",
        apiKey: "key",
      }),
    )

    const error = await integration
      .runAction("listTags", { ctx, props: {} })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ActiveCampaignApiError)
    expect(error).toMatchObject({
      message: "Invalid credentials",
      statusCode: 401,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
