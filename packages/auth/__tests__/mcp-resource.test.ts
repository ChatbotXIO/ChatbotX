import { APIError } from "better-auth/api"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { verifyBearerToken, verifyOAuthQueryParams } = vi.hoisted(() => ({
  verifyBearerToken: vi.fn(),
  verifyOAuthQueryParams: vi.fn(),
}))

vi.mock("@better-auth/oauth-provider/resource-client", () => ({
  oauthProviderResourceClient: () => ({
    getActions: () => ({ verifyBearerToken }),
  }),
}))

vi.mock("@better-auth/oauth-provider", () => ({
  oauthProviderAuthServerMetadata: vi.fn(),
  verifyOAuthQueryParams,
}))

vi.mock("../src/keys", () => ({
  env: { BETTER_AUTH_SECRET: "test-secret" },
  getMcpResourceUrl: () => "https://app.example.com/mcp",
}))

vi.mock("../src/logger", () => ({ logger: { error: vi.fn() } }))

import {
  McpTokenVerificationUnavailableError,
  verifyMcpAccessToken,
  verifyMcpOAuthQuery,
} from "../src/mcp-resource"
import type { Auth } from "../src/server"

const auth = {
  $context: Promise.resolve({ baseURL: "https://app.example.com/api/auth" }),
} as unknown as Auth

const joseError = (code: string) =>
  Object.assign(new Error(code), { code, name: "JOSEError" })

describe("verifyMcpAccessToken", () => {
  beforeEach(() => {
    verifyBearerToken.mockReset()
  })

  test("returns the subject and verifies against the MCP audience, origin issuer and JWKS", async () => {
    verifyBearerToken.mockResolvedValue({ client_id: "client-1", sub: "42" })

    await expect(verifyMcpAccessToken(auth, "a.b.c")).resolves.toEqual({
      clientId: "client-1",
      userId: "42",
    })
    expect(verifyBearerToken).toHaveBeenCalledWith("a.b.c", {
      jwksUrl: "https://app.example.com/api/auth/jwks",
      verifyOptions: {
        audience: "https://app.example.com/mcp",
        issuer: "https://app.example.com",
      },
    })
  })

  test("returns null for an expired token", async () => {
    verifyBearerToken.mockRejectedValue(
      new APIError("UNAUTHORIZED", { message: "token expired" }),
    )

    await expect(verifyMcpAccessToken(auth, "a.b.c")).resolves.toBeNull()
  })

  test("returns null for a token with another audience or a bad signature", async () => {
    verifyBearerToken.mockRejectedValue(
      new APIError("UNAUTHORIZED", { message: "invalid access token" }),
    )

    await expect(verifyMcpAccessToken(auth, "a.b.c")).resolves.toBeNull()
  })

  test("returns null for a raw jose token error", async () => {
    verifyBearerToken.mockRejectedValue(joseError("ERR_JWS_INVALID"))

    await expect(verifyMcpAccessToken(auth, "a.b.c")).resolves.toBeNull()
  })

  test("maps JWKS infrastructure failures to an unavailable error", async () => {
    verifyBearerToken.mockRejectedValue(joseError("ERR_JWKS_TIMEOUT"))

    await expect(verifyMcpAccessToken(auth, "a.b.c")).rejects.toBeInstanceOf(
      McpTokenVerificationUnavailableError,
    )
  })

  test("rethrows non-UNAUTHORIZED API errors", async () => {
    const error = new APIError("INTERNAL_SERVER_ERROR", { message: "boom" })
    verifyBearerToken.mockRejectedValue(error)

    await expect(verifyMcpAccessToken(auth, "a.b.c")).rejects.toBe(error)
  })

  test("returns null when client_id or sub is missing", async () => {
    verifyBearerToken.mockResolvedValueOnce({ sub: "42" })
    await expect(verifyMcpAccessToken(auth, "a.b.c")).resolves.toBeNull()

    verifyBearerToken.mockResolvedValueOnce({ client_id: "client-1" })
    await expect(verifyMcpAccessToken(auth, "a.b.c")).resolves.toBeNull()
  })
})

describe("verifyMcpOAuthQuery", () => {
  beforeEach(() => {
    verifyOAuthQueryParams.mockReset()
  })

  test("returns null for a query whose signature does not verify", async () => {
    verifyOAuthQueryParams.mockResolvedValue(false)

    await expect(
      verifyMcpOAuthQuery("client_id=client-1&sig=forged"),
    ).resolves.toBeNull()
    expect(verifyOAuthQueryParams).toHaveBeenCalledWith(
      "client_id=client-1&sig=forged",
      "test-secret",
    )
  })

  test("returns null for a signed query without a client id", async () => {
    verifyOAuthQueryParams.mockResolvedValue(true)

    await expect(verifyMcpOAuthQuery("scope=openid")).resolves.toBeNull()
  })

  test("returns the client id and space-separated scopes", async () => {
    verifyOAuthQueryParams.mockResolvedValue(true)

    await expect(
      verifyMcpOAuthQuery("client_id=client-1&scope=openid%20%20email"),
    ).resolves.toEqual({ clientId: "client-1", scopes: ["openid", "email"] })
  })
})
