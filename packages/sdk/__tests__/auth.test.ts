import {
  authValueSchema,
  customAuthSchema,
  oauth2AuthSchema,
  secretTextAuthSchema,
} from "@chatbotx.io/sdk"
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

describe("secretTextAuthSchema", () => {
  it("rejects an empty secretText", () => {
    expect(
      secretTextAuthSchema.safeParse({
        authType: "secretText",
        secretText: "",
      }).success,
    ).toBe(false)
  })

  it("preserves provider-defined fields alongside the required secretText", () => {
    expect(
      secretTextAuthSchema.parse({
        authType: "secretText",
        secretText: "api-key",
        baseURL: "https://example.com/v1",
      }),
    ).toEqual({
      authType: "secretText",
      secretText: "api-key",
      baseURL: "https://example.com/v1",
    })
  })
})

describe("oauth2AuthSchema", () => {
  it("rejects a missing tokens.accessToken", () => {
    expect(
      oauth2AuthSchema.safeParse({
        authType: "oauth2",
        clientId: "client-id",
        clientSecret: "client-secret",
        redirectUrl: "https://app.example.com/callback",
        tokens: {},
      }).success,
    ).toBe(false)
  })

  it("rejects a blank clientId", () => {
    expect(
      oauth2AuthSchema.safeParse({
        authType: "oauth2",
        clientId: "",
        clientSecret: "client-secret",
        redirectUrl: "https://app.example.com/callback",
        tokens: { accessToken: "access-token" },
      }).success,
    ).toBe(false)
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

  it("rejects an unrecognized authType", () => {
    expect(
      authValueSchema.safeParse({
        authType: "unknownAuthType",
        accessToken: "access-token",
      }).success,
    ).toBe(false)
  })

  it("rejects a secretText value with no secretText field", () => {
    expect(authValueSchema.safeParse({ authType: "secretText" }).success).toBe(
      false,
    )
  })
})
