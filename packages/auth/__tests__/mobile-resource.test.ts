import { APIError } from "better-auth/api"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { verifyBearerToken } = vi.hoisted(() => ({ verifyBearerToken: vi.fn() }))

vi.mock("@better-auth/oauth-provider/resource-client", () => ({
  oauthProviderResourceClient: () => ({
    getActions: () => ({ verifyBearerToken }),
  }),
}))

vi.mock("../src/keys", () => ({
  getMobileApiAudience: () => "https://app.example.com/api",
}))

vi.mock("../src/logger", () => ({ logger: { error: vi.fn() } }))

import {
  isMobileAccessTokenCandidate,
  MobileTokenVerificationUnavailableError,
  peekJwtAudiences,
  verifyMobileAccessToken,
} from "../src/mobile-resource"
import type { Auth } from "../src/server"

const auth = {
  $context: Promise.resolve({ baseURL: "https://app.example.com/api/auth" }),
} as unknown as Auth

const PADDING = /=+$/

const jwtWith = (payload: Record<string, unknown>) =>
  `${btoa(JSON.stringify({ alg: "RS256" }))}.${btoa(JSON.stringify(payload))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(PADDING, "")}.signature`

const joseError = (code: string) =>
  Object.assign(new Error(code), { code, name: "JOSEError" })

describe("audience routing", () => {
  test("a mobile-audience token is a mobile candidate", () => {
    expect(
      isMobileAccessTokenCandidate(
        jwtWith({ aud: "https://app.example.com/api" }),
      ),
    ).toBe(true)
  })

  test("an array audience containing the mobile audience is a candidate", () => {
    expect(
      isMobileAccessTokenCandidate(
        jwtWith({ aud: ["https://other", "https://app.example.com/api"] }),
      ),
    ).toBe(true)
  })

  test.each([
    ["an MCP token", { aud: "https://app.example.com/mcp" }],
    ["a token with no audience", {}],
    ["a token with a non-string audience", { aud: 42 }],
    ["a look-alike audience", { aud: "https://app.example.com/api/evil" }],
  ])("%s is not a mobile candidate", (_name, payload) => {
    expect(isMobileAccessTokenCandidate(jwtWith(payload))).toBe(false)
  })

  test.each([
    "",
    "opaque",
    "a.b",
    "a.b.c.d",
    "a.!!!.c",
  ])("malformed input %j yields no audiences and never throws", (token) => {
    expect(peekJwtAudiences(token)).toEqual([])
    expect(isMobileAccessTokenCandidate(token)).toBe(false)
  })
})

describe("verifyMobileAccessToken", () => {
  beforeEach(() => {
    verifyBearerToken.mockReset()
  })

  test("verifies against the mobile audience, origin issuer and JWKS, and returns the subject", async () => {
    verifyBearerToken.mockResolvedValue({
      sub: "42",
      deviceId: "install-1",
      mustChangePassword: true,
    })

    await expect(verifyMobileAccessToken(auth, "a.b.c")).resolves.toEqual({
      userId: "42",
      deviceId: "install-1",
      mustChangePassword: true,
    })
    expect(verifyBearerToken).toHaveBeenCalledWith("a.b.c", {
      jwksUrl: "https://app.example.com/api/auth/jwks",
      verifyOptions: {
        audience: "https://app.example.com/api",
        issuer: "https://app.example.com",
      },
    })
  })

  test("tolerates a token without the optional claims", async () => {
    verifyBearerToken.mockResolvedValue({ sub: "42" })

    await expect(verifyMobileAccessToken(auth, "a.b.c")).resolves.toEqual({
      userId: "42",
      deviceId: null,
      mustChangePassword: false,
    })
  })

  test.each([
    [
      "an unauthorized API error",
      new APIError("UNAUTHORIZED", { message: "bad" }),
    ],
    [
      "a jose signature failure",
      joseError("ERR_JWS_SIGNATURE_VERIFICATION_FAILED"),
    ],
    ["an expired token", joseError("ERR_JWT_EXPIRED")],
    ["a wrong audience", joseError("ERR_JWT_CLAIM_VALIDATION_FAILED")],
  ])("%s is a null result, not an error", async (_name, error) => {
    verifyBearerToken.mockRejectedValue(error)

    await expect(verifyMobileAccessToken(auth, "a.b.c")).resolves.toBeNull()
  })

  test("a token with no subject is rejected", async () => {
    verifyBearerToken.mockResolvedValue({ aud: "x" })
    await expect(verifyMobileAccessToken(auth, "a.b.c")).resolves.toBeNull()

    verifyBearerToken.mockResolvedValue({ sub: "" })
    await expect(verifyMobileAccessToken(auth, "a.b.c")).resolves.toBeNull()
  })

  test.each([
    "ERR_JWKS_TIMEOUT",
    "ERR_JWKS_INVALID",
    "ERR_JWKS_MULTIPLE_MATCHING_KEYS",
  ])("JWKS infrastructure failure %s surfaces as a server error, not a 401", async (code) => {
    verifyBearerToken.mockRejectedValue(joseError(code))

    await expect(verifyMobileAccessToken(auth, "a.b.c")).rejects.toBeInstanceOf(
      MobileTokenVerificationUnavailableError,
    )
  })

  test("an unexpected error propagates", async () => {
    verifyBearerToken.mockRejectedValue(new Error("boom"))

    await expect(verifyMobileAccessToken(auth, "a.b.c")).rejects.toThrow("boom")
  })
})
