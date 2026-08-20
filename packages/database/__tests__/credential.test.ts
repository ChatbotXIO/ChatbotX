import { describe, expect, test } from "vitest"
import {
  credentialEncryptedSchema,
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

describe("credentialEncryptedSchema", () => {
  const validBlob = {
    v: 1 as const,
    iv: "a".repeat(24),
    text: "ciphertext-hex",
    tag: "b".repeat(32),
    aad: "user:1:messenger:false",
  }

  test("accepts a blob with a non-empty aad", () => {
    const result = credentialEncryptedSchema.safeParse(validBlob)
    expect(result.success).toBe(true)
  })

  // aad is optional here, matching the transport schema: the writers stamp
  // it and decrypt reads it back off the blob, so no reader needs to
  // reconstruct or pass one, and a blob with no aad is a legitimate case
  // rather than an error.
  test("accepts a blob missing aad entirely", () => {
    const { aad: _aad, ...blobWithoutAad } = validBlob
    const result = credentialEncryptedSchema.safeParse(blobWithoutAad)
    expect(result.success).toBe(true)
  })

  test("kid remains optional for legacy blobs predating key versioning", () => {
    const { kid: _kid, ...blobWithoutKid } = { ...validBlob, kid: "k1" }
    const result = credentialEncryptedSchema.safeParse(blobWithoutKid)
    expect(result.success).toBe(true)
  })

  // These mirror the length/non-empty checks encryptedDataSchema enforces on
  // the same fields (packages/encryption/src/encryption.ts). credentialEncryptedSchema
  // is intentionally standalone rather than derived from that schema, so
  // without these checks a malformed iv/text/tag would pass this parse and
  // only fail later inside hexToBytes/WebCrypto with an opaque error instead
  // of a clear validation failure at the storage boundary.
  test("rejects a blob with a wrong-length iv", () => {
    const result = credentialEncryptedSchema.safeParse({
      ...validBlob,
      iv: "a".repeat(10),
    })
    expect(result.success).toBe(false)
  })

  test("rejects a blob with an empty-string text", () => {
    const result = credentialEncryptedSchema.safeParse({
      ...validBlob,
      text: "",
    })
    expect(result.success).toBe(false)
  })

  test("rejects a blob with a wrong-length tag", () => {
    const result = credentialEncryptedSchema.safeParse({
      ...validBlob,
      tag: "b".repeat(10),
    })
    expect(result.success).toBe(false)
  })
})
