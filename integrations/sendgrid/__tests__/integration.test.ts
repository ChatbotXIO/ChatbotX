import type { Context } from "@chatbotx.io/sdk"
import { afterEach, describe, expect, test, vi } from "vitest"
import { SendGridMissingScopesError } from "../src/error"
import { integration } from "../src/integration"
import { createSendGridAuth, type SendGridAuthValue } from "../src/schemas"

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

const createContext = (
  auth: SendGridAuthValue,
): Context<SendGridAuthValue> => ({
  auth,
  storagePrefix: "",
  platform: {
    appUrl: "",
    wsUrl: "",
    storageUrl: "",
    getRealtimeAuthHeaders: async () => ({}),
  },
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("SendGrid integration", () => {
  test.each([
    ["marketing.read", "marketing.write"],
    ["marketing_campaigns.read", "marketing_campaigns.update"],
  ])("validates supported Marketing scopes: %s and %s", async (...scopes) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ scopes })),
    )
    await expect(
      integration.runAction("validateCredentials", {
        props: { apiKey: " key " },
      }),
    ).resolves.toEqual({ authType: "custom", apiKey: "key" })
  })

  test("rejects keys missing a required scope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ scopes: ["marketing_campaigns.update"] }),
      ),
    )
    await expect(
      integration.runAction("validateCredentials", {
        props: { apiKey: "key" },
      }),
    ).rejects.toBeInstanceOf(SendGridMissingScopesError)
  })

  test("maps list pagination and ignores cross-origin next URLs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          result: [{ id: "list-1", name: "Customers", contact_count: 2 }],
          _metadata: {
            count: 2,
            next: "https://api.sendgrid.com/v3/marketing/lists?page_token=next",
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          result: [],
          _metadata: {
            next: "https://example.com/v3/marketing/lists?page_token=unsafe",
          },
        }),
      )
    vi.stubGlobal("fetch", fetchMock)
    const ctx = createContext(createSendGridAuth("key"))

    await expect(
      integration.runAction("listLists", {
        ctx,
        props: { pageSize: 1000, pageToken: "start" },
      }),
    ).resolves.toEqual({
      data: [{ id: "list-1", name: "Customers", contactCount: 2 }],
      nextPageToken: "next",
      count: 2,
    })
    await expect(
      integration.runAction("listLists", {
        ctx,
        props: { pageSize: 1000 },
      }),
    ).resolves.toEqual({
      data: [],
      nextPageToken: undefined,
      count: undefined,
    })
    const request = fetchMock.mock.calls[0]?.[0] as Request
    expect(request.url).toContain("page_size=1000")
    expect(request.url).toContain("page_token=start")
  })

  test("exposes custom fields and sends the exact contact payload", async () => {
    let body: unknown
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          custom_fields: [{ id: "field-1", name: "Plan", field_type: "Text" }],
          reserved_fields: [{ id: "email" }],
        }),
      )
      .mockImplementationOnce(async (request: Request) => {
        body = await request.clone().json()
        return jsonResponse({ job_id: "job-1" }, 202)
      })
    vi.stubGlobal("fetch", fetchMock)
    const ctx = createContext(createSendGridAuth("key"))

    await expect(
      integration.runAction("listCustomFields", { ctx, props: {} }),
    ).resolves.toEqual([{ id: "field-1", name: "Plan", fieldType: "Text" }])
    await expect(
      integration.runAction("addOrUpdateContact", {
        ctx,
        props: {
          list_ids: ["list-1"],
          contacts: [
            {
              email: "a@example.com",
              phone_number: "phone",
              custom_fields: { "field-1": "Pro" },
            },
          ],
        },
      }),
    ).resolves.toEqual({ job_id: "job-1" })
    expect(body).toEqual({
      list_ids: ["list-1"],
      contacts: [
        {
          email: "a@example.com",
          phone_number: "phone",
          custom_fields: { "field-1": "Pro" },
        },
      ],
    })
  })
})
