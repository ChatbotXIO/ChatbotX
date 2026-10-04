import { authValueSchema, customAuthSchema } from "@chatbotx.io/sdk"
import { describe, expect, it } from "vitest"

describe("customAuthSchema", () => {
  it("preserves provider-defined authentication fields", () => {
    expect(
      customAuthSchema.parse({
        authType: "custom",
        accessToken: "access-token",
        apiKey: "api-key",
        apiUrl: "https://provider.example.com",
      }),
    ).toEqual({
      authType: "custom",
      accessToken: "access-token",
      apiKey: "api-key",
      apiUrl: "https://provider.example.com",
    })
  })
})

describe("authValueSchema", () => {
  it("rejects values without a valid auth type", () => {
    expect(authValueSchema.safeParse(undefined).success).toBe(false)
    expect(authValueSchema.safeParse({}).success).toBe(false)
  })

  it("preserves provider-defined OAuth fields", () => {
    expect(
      authValueSchema.parse({
        authType: "oauth2",
        clientId: "client-id",
        clientSecret: "client-secret",
        redirectUrl: "https://app.example.com/callback",
        oaId: "zalo-oa-id",
        tokens: { accessToken: "access-token" },
      }),
    ).toEqual({
      authType: "oauth2",
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUrl: "https://app.example.com/callback",
      oaId: "zalo-oa-id",
      tokens: { accessToken: "access-token" },
    })
  })
})
