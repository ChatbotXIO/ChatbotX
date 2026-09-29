import { afterEach, describe, expect, it, vi } from "vitest"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("ky", async () => {
  const actual = await vi.importActual<typeof import("ky")>("ky")
  return {
    ...actual,
    default: { get: getMock, post: postMock },
  }
})

import {
  ensureAppWebhookFields,
  getAppWebhookSubscriptions,
  WHATSAPP_APP_SUBSCRIPTION_OBJECT,
  WHATSAPP_APP_WEBHOOK_FIELDS,
} from "../src/api/app-subscriptions"

const OBJECT = WHATSAPP_APP_SUBSCRIPTION_OBJECT.WHATSAPP_BUSINESS_ACCOUNT
const CALLBACK_URL = "https://example.com/integrations/whatsapp/webhook"

const jsonResponse = <T>(data: T) => ({
  json: vi.fn().mockResolvedValue(data),
})

const subscriptionsResponse = (
  fields: string[],
  overrides: { object?: string; callback_url?: string; active?: boolean } = {},
) => ({
  data: [
    {
      object: overrides.object ?? OBJECT,
      callback_url: overrides.callback_url ?? CALLBACK_URL,
      active: overrides.active ?? true,
      fields: fields.map((name) => ({ name, version: "v1" })),
    },
  ],
})

afterEach(() => {
  getMock.mockReset()
  postMock.mockReset()
})

describe("getAppWebhookSubscriptions", () => {
  it("GETs with the app access token in the Authorization header", async () => {
    getMock.mockReturnValueOnce(
      jsonResponse(subscriptionsResponse(["messages"])),
    )

    const result = await getAppWebhookSubscriptions({
      appId: "app-1",
      appSecret: "secret-1",
    })

    expect(result).toHaveLength(1)
    const [url, options] = getMock.mock.calls[0]
    expect(url).toContain("/app-1/subscriptions")
    expect(options.headers.Authorization).toBe("Bearer app-1|secret-1")
  })

  // Security: the app access token must never travel in the URL query
  // string — proxies and HTTP access logs commonly persist full request
  // URLs, which would leak `appId|appSecret`.
  it("never puts the access token in the URL or searchParams", async () => {
    getMock.mockReturnValueOnce(
      jsonResponse(subscriptionsResponse(["messages"])),
    )

    await getAppWebhookSubscriptions({ appId: "app-1", appSecret: "secret-1" })

    const [url, options] = getMock.mock.calls[0]
    expect(url).not.toContain("secret-1")
    expect(url).not.toContain("access_token")
    expect(options.searchParams).toBeUndefined()
  })
})

describe("ensureAppWebhookFields", () => {
  it("POSTs the union of existing + required fields when calls is missing", async () => {
    getMock.mockReturnValueOnce(
      jsonResponse(subscriptionsResponse(["messages"])),
    )
    postMock.mockReturnValueOnce(jsonResponse({ success: true }))

    const result = await ensureAppWebhookFields({
      appId: "app-1",
      appSecret: "secret-1",
      verifyToken: "verify-1",
      object: OBJECT,
      requiredFields: [WHATSAPP_APP_WEBHOOK_FIELDS.CALLS],
    })

    expect(postMock).toHaveBeenCalledTimes(1)
    const [url, options] = postMock.mock.calls[0]
    expect(url).toContain("/app-1/subscriptions")
    expect(options.headers.Authorization).toBe("Bearer app-1|secret-1")
    expect(options.json.object).toBe(OBJECT)
    expect(options.json.callback_url).toBe(CALLBACK_URL)
    expect(options.json.verify_token).toBe("verify-1")
    expect(options.json.fields.split(",").sort()).toEqual(
      ["messages", "calls"].sort(),
    )
    expect(result).toEqual({
      status: "subscribed",
      fields: expect.arrayContaining(["messages", "calls"]),
    })
  })

  it("never drops an existing field the app already subscribes to", async () => {
    getMock.mockReturnValueOnce(
      jsonResponse(
        subscriptionsResponse(["messages", "message_template_status_update"]),
      ),
    )
    postMock.mockReturnValueOnce(jsonResponse({ success: true }))

    await ensureAppWebhookFields({
      appId: "app-1",
      appSecret: "secret-1",
      verifyToken: "verify-1",
      object: OBJECT,
      requiredFields: [WHATSAPP_APP_WEBHOOK_FIELDS.CALLS],
    })

    const [, options] = postMock.mock.calls[0]
    const posted: string[] = options.json.fields.split(",")
    expect(posted).toContain("messages")
    expect(posted).toContain("message_template_status_update")
    expect(posted).toContain("calls")
  })

  it("does not POST when calls is already subscribed", async () => {
    getMock.mockReturnValueOnce(
      jsonResponse(subscriptionsResponse(["messages", "calls"])),
    )

    const result = await ensureAppWebhookFields({
      appId: "app-1",
      appSecret: "secret-1",
      verifyToken: "verify-1",
      object: OBJECT,
      requiredFields: [WHATSAPP_APP_WEBHOOK_FIELDS.CALLS],
    })

    expect(postMock).not.toHaveBeenCalled()
    expect(result.status).toBe("already-subscribed")
    expect(result.fields).toEqual(["messages", "calls"])
  })

  it("returns no-subscription and never POSTs when GET has no entry for the object", async () => {
    getMock.mockReturnValueOnce(
      jsonResponse({
        data: [
          {
            object: "instagram",
            callback_url: "https://example.com/other",
            active: true,
            fields: [{ name: "messages" }],
          },
        ],
      }),
    )

    const result = await ensureAppWebhookFields({
      appId: "app-1",
      appSecret: "secret-1",
      verifyToken: "verify-1",
      object: OBJECT,
      requiredFields: [WHATSAPP_APP_WEBHOOK_FIELDS.CALLS],
    })

    expect(postMock).not.toHaveBeenCalled()
    expect(result).toEqual({ status: "no-subscription", fields: [] })
  })

  it("subscribes calls and account_settings_update in two separate requests", async () => {
    getMock.mockReturnValueOnce(
      jsonResponse(subscriptionsResponse(["messages"])),
    )
    postMock.mockReturnValueOnce(jsonResponse({ success: true }))
    postMock.mockReturnValueOnce(jsonResponse({ success: true }))

    const result = await ensureAppWebhookFields({
      appId: "app-1",
      appSecret: "secret-1",
      verifyToken: "verify-1",
      object: OBJECT,
      requiredFields: [WHATSAPP_APP_WEBHOOK_FIELDS.CALLS],
      optionalFields: [WHATSAPP_APP_WEBHOOK_FIELDS.ACCOUNT_SETTINGS_UPDATE],
    })

    expect(postMock).toHaveBeenCalledTimes(2)
    const [, firstOptions] = postMock.mock.calls[0]
    expect(firstOptions.json.fields.split(",")).not.toContain(
      "account_settings_update",
    )
    const [, secondOptions] = postMock.mock.calls[1]
    expect(secondOptions.json.fields.split(",")).toContain(
      "account_settings_update",
    )
    expect(result.status).toBe("subscribed")
    expect(result.fields).toContain("account_settings_update")
  })

  it("never fails the required result when the optional field POST fails", async () => {
    getMock.mockReturnValueOnce(
      jsonResponse(subscriptionsResponse(["messages"])),
    )
    postMock.mockReturnValueOnce(jsonResponse({ success: true }))
    postMock.mockImplementationOnce(() => {
      throw new Error("optional field rejected")
    })

    const result = await ensureAppWebhookFields({
      appId: "app-1",
      appSecret: "secret-1",
      verifyToken: "verify-1",
      object: OBJECT,
      requiredFields: [WHATSAPP_APP_WEBHOOK_FIELDS.CALLS],
      optionalFields: [WHATSAPP_APP_WEBHOOK_FIELDS.ACCOUNT_SETTINGS_UPDATE],
    })

    expect(result.status).toBe("subscribed")
    expect(result.fields).toContain("calls")
    expect(result.fields).not.toContain("account_settings_update")
  })
})
