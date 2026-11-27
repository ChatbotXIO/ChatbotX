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
  test("asks for the WhatsApp Business app screen when reconnecting a coexistence number", async () => {
    const { buildFacebookOAuthDialogUrl } = await loadWith({
      NEXT_PUBLIC_BROKER_URL: BROKER_URL,
    })

    const extrasFor = (connectExisting: boolean) =>
      JSON.parse(
        new URL(
          buildFacebookOAuthDialogUrl({
            resellerOrigin: RESELLER_ORIGIN,
            redirectUri: `${BROKER_URL}/integrations/whatsapp/callback`,
            clientId: "client-1",
            configId: "config-1",
            version: "v21.0",
            connectExisting,
          }),
        ).searchParams.get("extras") ?? "{}",
      )

    // Meta only lists a WhatsApp Business app account behind this feature
    // type; the default screen shows Cloud API WABAs and nothing else, which
    // left such a number with nothing to select on reconnect.
    expect(extrasFor(true).featureType).toBe("whatsapp_business_app_onboarding")
    expect(extrasFor(false).featureType).toBeUndefined()
  })

  test("pins every flow to Embedded Signup v4 by default", async () => {
    const { buildFacebookOAuthDialogUrl, DEFAULT_EMBEDDED_SIGNUP_VERSION } =
      await loadWith({ NEXT_PUBLIC_BROKER_URL: BROKER_URL })

    const result = new URL(
      buildFacebookOAuthDialogUrl({
        resellerOrigin: RESELLER_ORIGIN,
        redirectUri: `${BROKER_URL}/integrations/whatsapp/callback`,
        clientId: "client-1",
        configId: "config-1",
        version: "v21.0",
        connectExisting: false,
      }),
    )
    const extras = JSON.parse(result.searchParams.get("extras") ?? "{}")

    expect(DEFAULT_EMBEDDED_SIGNUP_VERSION).toBe("v4")
    expect(extras.version).toBe("v4")
    // v4 dropped `marketing_messages_lite` as a feature — it is a Login
    // Configuration product there — and only v2 needs `sessionInfoVersion`.
    expect(extras.features).toBeUndefined()
    expect(extras.sessionInfoVersion).toBeUndefined()
  })

  test("omits auth_type on a first connect", async () => {
    const { buildFacebookOAuthDialogUrl } = await loadWith({
      NEXT_PUBLIC_BROKER_URL: BROKER_URL,
    })

    const result = new URL(
      buildFacebookOAuthDialogUrl({
        resellerOrigin: RESELLER_ORIGIN,
        redirectUri: `${BROKER_URL}/integrations/whatsapp/callback`,
        clientId: "client-1",
        configId: "config-1",
        version: "v21.0",
        connectExisting: false,
      }),
    )

    expect(result.searchParams.get("auth_type")).toBeNull()
  })

  test("asks Meta to re-request permissions when the caller is reconnecting", async () => {
    const { buildFacebookOAuthDialogUrl, FACEBOOK_AUTH_TYPES } = await loadWith(
      {
        NEXT_PUBLIC_BROKER_URL: BROKER_URL,
      },
    )

    const result = new URL(
      buildFacebookOAuthDialogUrl({
        resellerOrigin: RESELLER_ORIGIN,
        redirectUri: `${BROKER_URL}/integrations/whatsapp/callback`,
        clientId: "client-1",
        configId: "config-1",
        version: "v21.0",
        connectExisting: false,
        authType: FACEBOOK_AUTH_TYPES.REREQUEST,
      }),
    )

    // Without it Meta returns a code carrying the permissions the account
    // already granted, so a permission added to the Embedded Signup
    // configuration is never offered and the reconnect looks like a no-op.
    expect(result.searchParams.get("auth_type")).toBe("rerequest")
  })

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
        connectExisting: true,
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

    const extras = JSON.parse(result.searchParams.get("extras") ?? "{}")
    expect(extras.featureType).toBe("whatsapp_business_app_onboarding")
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
  test("returns the coexist onboarding type when connecting an existing account", async () => {
    const { resolveEmbeddedSignupFeatureType, EMBEDDED_SIGNUP_FEATURE_TYPES } =
      await loadWith({ NEXT_PUBLIC_BROKER_URL: BROKER_URL })

    expect(
      resolveEmbeddedSignupFeatureType({
        connectExisting: true,
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
      }),
    ).toBeUndefined()
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
        manualConnect: true,
      }),
    ).toBe(false)
  })

  test("is false for a fresh signup", async () => {
    const { isCoexistOnboardingIntent } = await loadWith({
      NEXT_PUBLIC_BROKER_URL: BROKER_URL,
    })

    expect(isCoexistOnboardingIntent({ connectExisting: false })).toBe(false)
  })
})
