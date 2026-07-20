import { describe, expect, test } from "vitest"
import {
  giphyCredentialUpdateSchema,
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
