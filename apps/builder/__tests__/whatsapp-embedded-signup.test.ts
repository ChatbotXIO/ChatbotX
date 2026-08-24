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
  test("opens the Facebook dialog with the caller-supplied redirect_uri", async () => {
    const { buildFacebookOAuthDialogUrl, decodeOAuthState } = await loadWith({
      NEXT_PUBLIC_BROKER_URL: BROKER_URL,
    })

    const redirectUri = `${BROKER_URL}/integrations/whatsapp/callback`
    const result = new URL(
      buildFacebookOAuthDialogUrl({
        resellerOrigin: RESELLER_ORIGIN,
        redirectUri,
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
    // redirect_uri is passed straight through — this module no longer decides
    // which host it points at (see lib/provider-origin.ts).
    expect(result.searchParams.get("redirect_uri")).toBe(redirectUri)

    const state = decodeOAuthState(result.searchParams.get("state") ?? "")
    expect(state).toEqual({ referer: RESELLER_ORIGIN, locale: "vi" })

    // transferPhoneNumber sends the user to Meta's existing-WABA sharing screen,
    // which is where a number hosted by another provider is migrated from.
    const extras = JSON.parse(result.searchParams.get("extras") ?? "{}")
    expect(extras.featureType).toBe("only_waba_sharing")
  })

  test("passes through a tenant-owned credential's own custom-domain redirect_uri unchanged", async () => {
    const { buildFacebookOAuthDialogUrl } = await loadWith({
      NEXT_PUBLIC_BROKER_URL: BROKER_URL,
    })

    const redirectUri = `${RESELLER_ORIGIN}/integrations/whatsapp/callback`
    const result = new URL(
      buildFacebookOAuthDialogUrl({
        resellerOrigin: RESELLER_ORIGIN,
        redirectUri,
        clientId: "client-1",
        configId: "config-1",
        version: "v21.0",
        connectExisting: true,
        transferPhoneNumber: false,
      }),
    )

    expect(result.searchParams.get("redirect_uri")).toBe(redirectUri)
  })

  test("still works without a configured broker when the caller supplies the builder origin", async () => {
    const { buildFacebookOAuthDialogUrl } = await loadWith({
      NEXT_PUBLIC_BROKER_URL: undefined,
    })

    const redirectUri = `${BUILDER_URL}/integrations/whatsapp/callback`
    const result = new URL(
      buildFacebookOAuthDialogUrl({
        resellerOrigin: RESELLER_ORIGIN,
        redirectUri,
        clientId: "client-1",
        configId: "config-1",
        version: "v21.0",
        connectExisting: true,
        transferPhoneNumber: false,
      }),
    )

    expect(result.searchParams.get("redirect_uri")).toBe(redirectUri)
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
  test("returns WABA sharing when transferring a phone from another provider", async () => {
    const { resolveEmbeddedSignupFeatureType, EMBEDDED_SIGNUP_FEATURE_TYPES } =
      await loadWith({ NEXT_PUBLIC_BROKER_URL: BROKER_URL })

    expect(
      resolveEmbeddedSignupFeatureType({
        connectExisting: false,
        transferPhoneNumber: true,
      }),
    ).toBe(EMBEDDED_SIGNUP_FEATURE_TYPES.ONLY_WABA_SHARING)
  })

  test("returns the coexist onboarding type when connecting an existing account", async () => {
    const { resolveEmbeddedSignupFeatureType, EMBEDDED_SIGNUP_FEATURE_TYPES } =
      await loadWith({ NEXT_PUBLIC_BROKER_URL: BROKER_URL })

    expect(
      resolveEmbeddedSignupFeatureType({
        connectExisting: true,
        transferPhoneNumber: false,
      }),
    ).toBe(EMBEDDED_SIGNUP_FEATURE_TYPES.WHATSAPP_BUSINESS_APP_ONBOARDING)
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

  test("lets the transfer intent win when both toggles are set", async () => {
    const { resolveEmbeddedSignupFeatureType, EMBEDDED_SIGNUP_FEATURE_TYPES } =
      await loadWith({ NEXT_PUBLIC_BROKER_URL: BROKER_URL })

    expect(
      resolveEmbeddedSignupFeatureType({
        connectExisting: true,
        transferPhoneNumber: true,
      }),
    ).toBe(EMBEDDED_SIGNUP_FEATURE_TYPES.ONLY_WABA_SHARING)
  })
})

describe("isCoexistOnboardingIntent", () => {
  test("is true only when Meta was asked for the coexist onboarding flow", async () => {
    const { isCoexistOnboardingIntent } = await loadWith({
      NEXT_PUBLIC_BROKER_URL: BROKER_URL,
    })

    expect(
      isCoexistOnboardingIntent({
        connectExisting: true,
        transferPhoneNumber: false,
      }),
    ).toBe(true)
  })

  test("is false for a manual connect, which never opens the Meta dialog", async () => {
    const { isCoexistOnboardingIntent } = await loadWith({
      NEXT_PUBLIC_BROKER_URL: BROKER_URL,
    })

    // The manualConnect toggle is only reachable with connectExisting on, so the
    // coexist gate must exclude it explicitly.
    expect(
      isCoexistOnboardingIntent({
        connectExisting: true,
        transferPhoneNumber: false,
        manualConnect: true,
      }),
    ).toBe(false)
  })

  test("is false for a transfer, a fresh signup, and an ambiguous both-on form", async () => {
    const { isCoexistOnboardingIntent } = await loadWith({
      NEXT_PUBLIC_BROKER_URL: BROKER_URL,
    })

    expect(
      isCoexistOnboardingIntent({
        connectExisting: false,
        transferPhoneNumber: true,
      }),
    ).toBe(false)
    expect(
      isCoexistOnboardingIntent({
        connectExisting: false,
        transferPhoneNumber: false,
      }),
    ).toBe(false)
    // Both on resolves to only_waba_sharing, so the server must not run the
    // coexist eligibility check for it.
    expect(
      isCoexistOnboardingIntent({
        connectExisting: true,
        transferPhoneNumber: true,
      }),
    ).toBe(false)
  })
})
