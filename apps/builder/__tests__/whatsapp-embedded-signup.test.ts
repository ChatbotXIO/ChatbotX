// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const BUILDER_URL = "https://app.example.com"
const BROKER_URL = "https://broker.example.com"
const RESELLER_ORIGIN = "https://chat.reseller.com"

async function loadWith(envOverrides: Record<string, string | undefined>) {
  vi.resetModules()
  vi.doMock("@/env", () => ({
    env: {
      NEXT_PUBLIC_BUILDER_URL: BUILDER_URL,
      ...envOverrides,
    },
  }))
  return await import("@/features/integration-whatsapp/libs/embedded-signup")
}

afterEach(() => {
  vi.resetModules()
  vi.doUnmock("@/env")
})

describe("buildFacebookOAuthDialogUrl", () => {
  test("opens the Facebook dialog with the broker callback as redirect_uri", async () => {
    const { buildFacebookOAuthDialogUrl, decodeOAuthState } = await loadWith({
      NEXT_PUBLIC_BROKER_URL: BROKER_URL,
    })

    const result = new URL(
      buildFacebookOAuthDialogUrl({
        resellerOrigin: RESELLER_ORIGIN,
        clientId: "client-1",
        configId: "config-1",
        version: "v21.0",
        connectExisting: false,
        transferPhoneNumber: true,
        locale: "vi",
      }),
    )

    expect(result.origin).toBe("https://www.facebook.com")
    expect(result.pathname).toBe("/v21.0/dialog/oauth")
    expect(result.searchParams.get("client_id")).toBe("client-1")
    expect(result.searchParams.get("config_id")).toBe("config-1")
    expect(result.searchParams.get("response_type")).toBe("code")
    // redirect_uri must be the Meta-registered broker callback, not the reseller.
    expect(result.searchParams.get("redirect_uri")).toBe(
      `${BROKER_URL}/integrations/whatsapp/callback`,
    )

    const state = decodeOAuthState(result.searchParams.get("state") ?? "")
    expect(state).toEqual({ referer: RESELLER_ORIGIN, locale: "vi" })

    // transferPhoneNumber drives the coexist onboarding featureType in extras.
    const extras = JSON.parse(result.searchParams.get("extras") ?? "{}")
    expect(extras.featureType).toBe("whatsapp_business_app_onboarding")
  })

  test("falls back to the builder origin when no broker is configured", async () => {
    const { buildFacebookOAuthDialogUrl } = await loadWith({
      NEXT_PUBLIC_BROKER_URL: undefined,
    })

    const result = new URL(
      buildFacebookOAuthDialogUrl({
        resellerOrigin: RESELLER_ORIGIN,
        clientId: "client-1",
        configId: "config-1",
        version: "v21.0",
        connectExisting: true,
        transferPhoneNumber: false,
      }),
    )

    expect(result.searchParams.get("redirect_uri")).toBe(
      `${BUILDER_URL}/integrations/whatsapp/callback`,
    )
  })
})

describe("encodeOAuthState / decodeOAuthState", () => {
  test("round-trips referer and locale", async () => {
    const { encodeOAuthState, decodeOAuthState } = await loadWith({
      NEXT_PUBLIC_BROKER_URL: BROKER_URL,
    })

    const encoded = encodeOAuthState({ referer: RESELLER_ORIGIN, locale: "en" })
    expect(decodeOAuthState(encoded)).toEqual({
      referer: RESELLER_ORIGIN,
      locale: "en",
    })
  })

  test("rejects malformed state", async () => {
    const { decodeOAuthState } = await loadWith({
      NEXT_PUBLIC_BROKER_URL: BROKER_URL,
    })

    expect(decodeOAuthState("not-base64-json")).toBeNull()
  })

  test("rejects state without a referer", async () => {
    const { decodeOAuthState } = await loadWith({
      NEXT_PUBLIC_BROKER_URL: BROKER_URL,
    })

    const encoded = btoa(JSON.stringify({ locale: "en" }))
    expect(decodeOAuthState(encoded)).toBeNull()
  })
})

describe("resolveEmbeddedSignupFeatureType", () => {
  test("returns the coexist onboarding type when transferring a phone", async () => {
    const { resolveEmbeddedSignupFeatureType, EMBEDDED_SIGNUP_FEATURE_TYPES } =
      await loadWith({ NEXT_PUBLIC_BROKER_URL: BROKER_URL })

    expect(
      resolveEmbeddedSignupFeatureType({
        connectExisting: false,
        transferPhoneNumber: true,
      }),
    ).toBe(EMBEDDED_SIGNUP_FEATURE_TYPES.WHATSAPP_BUSINESS_APP_ONBOARDING)
  })

  test("returns WABA sharing when connecting an existing account", async () => {
    const { resolveEmbeddedSignupFeatureType, EMBEDDED_SIGNUP_FEATURE_TYPES } =
      await loadWith({ NEXT_PUBLIC_BROKER_URL: BROKER_URL })

    expect(
      resolveEmbeddedSignupFeatureType({
        connectExisting: true,
        transferPhoneNumber: false,
      }),
    ).toBe(EMBEDDED_SIGNUP_FEATURE_TYPES.ONLY_WABA_SHARING)
  })

  test("returns undefined for a fresh signup", async () => {
    const { resolveEmbeddedSignupFeatureType } = await loadWith({
      NEXT_PUBLIC_BROKER_URL: BROKER_URL,
    })

    expect(
      resolveEmbeddedSignupFeatureType({
        connectExisting: false,
        transferPhoneNumber: false,
      }),
    ).toBeUndefined()
  })
})
