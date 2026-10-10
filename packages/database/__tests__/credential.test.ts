import { describe, expect, test } from "vitest"
import {
  giphyCredentialUpdateSchema,
  googleAdsCredentialPublicSchema,
  googleAdsCredentialSchema,
  googleAdsCredentialUpdateSchema,
  googleCredentialPublicSchema,
  googleCredentialSchema,
  googleCredentialUpdateSchema,
  instagramCredentialUpdateSchema,
  messengerCredentialUpdateSchema,
  smtpCredentialUpdateSchema,
  stripeCredentialUpdateSchema,
  tiktokCredentialUpdateSchema,
  whatsappCredentialUpdateSchema,
  zaloCredentialUpdateSchema,
} from "../src/partials/credential"

describe("credential update schemas", () => {
  test.each([
    [
      "WhatsApp",
      whatsappCredentialUpdateSchema,
      {
        clientId: " client-id ",
        version: " v25.0 ",
        configId: " config-id ",
        systemUserId: " system-user-id ",
        businessId: " business-id ",
        businessName: " business name ",
        verifyToken: " verify-token ",
        clientSecret: " client-secret ",
        systemUserToken: " system-user-token ",
      },
    ],
    [
      "Messenger",
      messengerCredentialUpdateSchema,
      {
        clientId: " client-id ",
        version: " v25.0 ",
        verifyToken: " verify-token ",
        clientSecret: " client-secret ",
      },
    ],
    [
      "Google",
      googleCredentialUpdateSchema,
      {
        clientId: " client-id ",
        clientSecret: " client-secret ",
        verifyToken: " verify-token ",
      },
    ],
    [
      "Instagram",
      instagramCredentialUpdateSchema,
      {
        clientId: " client-id ",
        version: " v25.0 ",
        verifyToken: " verify-token ",
        clientSecret: " client-secret ",
      },
    ],
    [
      "Zalo",
      zaloCredentialUpdateSchema,
      {
        clientId: " client-id ",
        version: " v25.0 ",
        verifyToken: " verify-token ",
        clientSecret: " client-secret ",
      },
    ],
    ["GIPHY", giphyCredentialUpdateSchema, { apiKey: " api-key " }],
    [
      "Stripe",
      stripeCredentialUpdateSchema,
      {
        publishableKey: " publishable-key ",
        verifyToken: " verify-token ",
        secretKey: " secret-key ",
      },
    ],
    [
      "TikTok",
      tiktokCredentialUpdateSchema,
      {
        clientId: " client-id ",
        clientSecret: " client-secret ",
      },
    ],
  ])("trims %s credential values", (_name, schema, input) => {
    const result = schema.parse(input)

    for (const value of Object.values(result)) {
      if (typeof value === "string") {
        expect(value).toBe(value.trim())
      }
    }
  })

  test("rejects blank required values", () => {
    const result = messengerCredentialUpdateSchema.safeParse({
      clientId: "   ",
      version: "v25.0",
      verifyToken: "verify-token",
      clientSecret: "client-secret",
    })

    expect(result.success).toBe(false)
  })

  test("preserves optional values while trimming them when provided", () => {
    const result = whatsappCredentialUpdateSchema.parse({
      clientId: "client-id",
      version: "v25.0",
      configId: "config-id",
      systemUserId: "system-user-id",
      businessId: " business-id ",
      businessName: "business name",
      verifyToken: "verify-token",
      clientSecret: "client-secret",
      systemUserToken: "system-user-token",
    })

    expect(result.businessId).toBe("business-id")
  })

  test("keeps SMTP validation for trimmed email and coerced port", () => {
    const result = smtpCredentialUpdateSchema.parse({
      host: " smtp.example.com ",
      port: "2525",
      username: " username ",
      password: "",
      fromEmail: " sender@example.com ",
      fromName: " Sender ",
    })

    expect(result).toMatchObject({
      host: "smtp.example.com",
      port: 2525,
      username: "username",
      fromEmail: "sender@example.com",
      fromName: "Sender",
    })
  })
})

describe("googleAds credential", () => {
  const base = {
    clientId: "client-id",
    clientSecret: "client-secret",
    developerToken: "dev-token",
  }

  test("requires client id and client secret; the developer token is optional", () => {
    expect(googleAdsCredentialSchema.parse(base)).toEqual(base)
    for (const field of ["clientId", "clientSecret"]) {
      const { [field]: _omitted, ...rest } = base as Record<string, string>
      expect(googleAdsCredentialSchema.safeParse(rest).success).toBe(false)
    }
    const { developerToken: _token, ...withoutToken } = base
    expect(googleAdsCredentialSchema.parse(withoutToken)).toEqual(withoutToken)
  })

  test("a stored credential without uploadMethod still parses (absent = Data Manager)", () => {
    expect(googleAdsCredentialSchema.parse(base).uploadMethod).toBeUndefined()
  })

  test.each([
    "dataManager",
    "legacy",
  ] as const)("accepts uploadMethod %s", (uploadMethod) => {
    expect(
      googleAdsCredentialSchema.parse({ ...base, uploadMethod }).uploadMethod,
    ).toBe(uploadMethod)
  })

  test("rejects an unknown uploadMethod", () => {
    expect(
      googleAdsCredentialSchema.safeParse({ ...base, uploadMethod: "soap" })
        .success,
    ).toBe(false)
  })

  test("the public projection exposes the client id and upload method only", () => {
    expect(googleAdsCredentialPublicSchema.parse(base)).toEqual({
      clientId: "client-id",
      hasDeveloperToken: true,
    })
    const { developerToken: _token, ...withoutToken } = base
    expect(googleAdsCredentialPublicSchema.parse(withoutToken)).toEqual({
      clientId: "client-id",
      hasDeveloperToken: false,
    })
    expect(
      googleAdsCredentialPublicSchema.parse({
        ...base,
        uploadMethod: "legacy",
      }),
    ).toEqual({
      clientId: "client-id",
      uploadMethod: "legacy",
      hasDeveloperToken: true,
    })
  })

  test("the update schema trims values and treats the secrets as optional", () => {
    expect(
      googleAdsCredentialUpdateSchema.parse({
        clientId: " client-id ",
        clientSecret: " secret ",
        developerToken: " token ",
      }),
    ).toEqual({
      clientId: "client-id",
      clientSecret: "secret",
      developerToken: "token",
    })
    expect(
      googleAdsCredentialUpdateSchema.parse({ clientId: "client-id" }),
    ).toEqual({ clientId: "client-id" })
    expect(
      googleAdsCredentialUpdateSchema.parse({
        clientId: "client-id",
        uploadMethod: "legacy",
      }),
    ).toEqual({ clientId: "client-id", uploadMethod: "legacy" })
    expect(
      googleAdsCredentialUpdateSchema.safeParse({
        clientId: "client-id",
        uploadMethod: "x",
      }).success,
    ).toBe(false)
    expect(
      googleAdsCredentialUpdateSchema.safeParse({ clientId: " " }).success,
    ).toBe(false)
  })

  test("the google credential no longer carries an Ads developer token", () => {
    const parsed = googleCredentialSchema.parse({
      clientId: "c",
      clientSecret: "s",
      verifyToken: "v",
      adsDeveloperToken: "t",
    })
    expect(parsed).not.toHaveProperty("adsDeveloperToken")
    expect(googleCredentialPublicSchema.parse(parsed)).toEqual({
      clientId: "c",
    })
  })
})
