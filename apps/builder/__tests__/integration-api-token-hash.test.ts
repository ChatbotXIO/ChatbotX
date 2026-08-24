import { describe, expect, test } from "vitest"
import { generateApiChannelToken } from "@/features/integration-api/lib/generate-credentials"
import { hashToken } from "@/features/integration-api/lib/token-hash"

const TOKEN_PREFIX = "cbx_api_"
const SHA256_HEX_LENGTH = 64
// 8-char prefix + 43 chars of unpadded base64url for 32 random bytes.
const TOKEN_LENGTH = 51
const LOWERCASE_HEX_PATTERN = /^[0-9a-f]+$/
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/

describe("integration-api token hashing", () => {
  test("stored tokenHash matches what the auth middleware computes for the token", async () => {
    // Arrange
    const { token, tokenHash } = await generateApiChannelToken()

    // Act
    const verificationHash = await hashToken(token)

    // Assert
    expect(verificationHash).toBe(tokenHash)
  })

  test("tokenHash is lowercase sha-256 hex", async () => {
    // Arrange
    const { tokenHash } = await generateApiChannelToken()

    // Assert
    expect(tokenHash).toMatch(LOWERCASE_HEX_PATTERN)
    expect(tokenHash).toHaveLength(SHA256_HEX_LENGTH)
  })

  test("token starts with the display prefix and stays in the base64url alphabet", async () => {
    // Arrange
    const { token } = await generateApiChannelToken()

    // Assert
    expect(token.startsWith(TOKEN_PREFIX)).toBe(true)
    expect(token.slice(TOKEN_PREFIX.length)).toMatch(BASE64URL_PATTERN)
    expect(token).toHaveLength(TOKEN_LENGTH)
  })

  test("tokenPrefix carries distinguishing characters beyond the static literal", async () => {
    // Arrange
    const { token, tokenPrefix } = await generateApiChannelToken()

    // Assert
    expect(tokenPrefix.length).toBeGreaterThan(TOKEN_PREFIX.length)
    expect(token.startsWith(tokenPrefix)).toBe(true)
  })

  test("generates a unique token and hash per call", async () => {
    // Arrange
    const first = await generateApiChannelToken()
    const second = await generateApiChannelToken()

    // Assert
    expect(first.token).not.toBe(second.token)
    expect(first.tokenHash).not.toBe(second.tokenHash)
  })
})
