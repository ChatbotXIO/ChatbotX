import { afterEach, describe, expect, it, vi } from "vitest"

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))

vi.mock("ky", async () => {
  const actual = await vi.importActual<typeof import("ky")>("ky")
  return {
    ...actual,
    default: { post: postMock },
    HTTPError: actual.HTTPError,
  }
})

import {
  subscribeWebhook,
  WHATSAPP_BASE_SUBSCRIBED_FIELDS,
  WHATSAPP_SUBSCRIBED_FIELDS,
} from "../src/api/webhook"
import type { WhatsappAuthValue } from "../src/schema"

const buildAuth = (
  overrides: Partial<WhatsappAuthValue> = {},
): WhatsappAuthValue =>
  ({
    clientId: "client",
    clientSecret: "secret",
    verifyToken: "verify",
    redirectUrl: "https://example.com/cb",
    authType: "oauth2",
    tokens: { accessToken: "tok-abc" },
    version: "v23.0",
    metadata: {
      wabaId: "waba-1",
      webhookUrl: "https://example.com/wh",
    },
    ...overrides,
  }) as unknown as WhatsappAuthValue

const okResponse = () => ({
  json: vi.fn().mockResolvedValue({ success: true }),
})

afterEach(() => {
  postMock.mockReset()
})

describe("subscribeWebhook", () => {
  it("posts base subscribed_fields by default", async () => {
    postMock.mockReturnValueOnce(okResponse())

    await subscribeWebhook({ auth: buildAuth() })

    expect(postMock).toHaveBeenCalledTimes(1)
    const [url, options] = postMock.mock.calls[0]
    expect(url).toContain("/waba-1/subscribed_apps")
    expect(options.json.subscribed_fields).toEqual([
      ...WHATSAPP_BASE_SUBSCRIBED_FIELDS,
    ])
    expect(options.json.subscribed_fields).not.toContain("automatic_events")
    expect(options.headers.Authorization).toBe("Bearer tok-abc")
  })

  it("posts automatic_events when includeAutomaticEvents=true", async () => {
    postMock.mockReturnValueOnce(okResponse())

    await subscribeWebhook({
      auth: buildAuth(),
      includeAutomaticEvents: true,
    })

    const [, options] = postMock.mock.calls[0]
    expect(options.json.subscribed_fields).toEqual([
      ...WHATSAPP_SUBSCRIBED_FIELDS,
    ])
  })

  it("adds override_callback_uri from metadata.webhookUrl when overrideCallbackUrl=true", async () => {
    postMock.mockReturnValueOnce(okResponse())

    await subscribeWebhook({
      auth: buildAuth(),
      overrideCallbackUrl: true,
    })

    const [, options] = postMock.mock.calls[0]
    expect(options.json.override_callback_uri).toBe("https://example.com/wh")
    expect(options.json.verify_token).toBe("verify")
    expect(options.json.subscribed_fields).toHaveLength(4)
  })

  it("omits override fields when overrideCallbackUrl not set and env var unset", async () => {
    const prev = process.env.WHATSAPP_OVERRIDE_CALLBACK_URI
    process.env.WHATSAPP_OVERRIDE_CALLBACK_URI = ""
    postMock.mockReturnValueOnce(okResponse())

    await subscribeWebhook({ auth: buildAuth() })

    const [, options] = postMock.mock.calls[0]
    expect(options.json.override_callback_uri).toBeUndefined()
    expect(options.json.verify_token).toBeUndefined()

    if (prev === undefined) {
      delete process.env.WHATSAPP_OVERRIDE_CALLBACK_URI
    } else {
      process.env.WHATSAPP_OVERRIDE_CALLBACK_URI = prev
    }
  })

  // -------------------------------------------------------------------------
  // H8 — override_callback_uri inverted-logic tests
  // -------------------------------------------------------------------------

  it("H8(1): falls back to env override_callback_uri when overrideCallbackUrl=false and env set", async () => {
    // Deployment-level override (WHATSAPP_OVERRIDE_CALLBACK_URI) must apply on
    // the standard connect path where the caller does not pass
    // overrideCallbackUrl — this is how self-hosted/dev/staging route Meta
    // webhooks to the real deployment URL. The branches are exclusive, so this
    // env path and the metadata path never overwrite each other.
    const prev = process.env.WHATSAPP_OVERRIDE_CALLBACK_URI
    process.env.WHATSAPP_OVERRIDE_CALLBACK_URI =
      "https://env-override.example.com/wh"
    postMock.mockReturnValueOnce(okResponse())

    await subscribeWebhook({ auth: buildAuth(), overrideCallbackUrl: false })

    const [, options] = postMock.mock.calls[0]
    expect(options.json.override_callback_uri).toBe(
      "https://env-override.example.com/wh",
    )
    expect(options.json.verify_token).toBeDefined()

    if (prev === undefined) {
      delete process.env.WHATSAPP_OVERRIDE_CALLBACK_URI
    } else {
      process.env.WHATSAPP_OVERRIDE_CALLBACK_URI = prev
    }
  })

  it("H8(2): uses metadata.webhookUrl when overrideCallbackUrl=true", async () => {
    // When the caller explicitly requests an override, the URL comes from
    // auth.metadata.webhookUrl — not from the env var.
    const prev = process.env.WHATSAPP_OVERRIDE_CALLBACK_URI
    process.env.WHATSAPP_OVERRIDE_CALLBACK_URI =
      "https://env-override.example.com/wh"
    postMock.mockReturnValueOnce(okResponse())

    await subscribeWebhook({
      auth: buildAuth(),
      overrideCallbackUrl: true,
    })

    const [, options] = postMock.mock.calls[0]
    expect(options.json.override_callback_uri).toBe("https://example.com/wh")
    expect(options.json.verify_token).toBe("verify")

    if (prev === undefined) {
      delete process.env.WHATSAPP_OVERRIDE_CALLBACK_URI
    } else {
      process.env.WHATSAPP_OVERRIDE_CALLBACK_URI = prev
    }
  })
})
