import { beforeEach, describe, expect, test, vi } from "vitest"
import { verifyAiProviderApiKey } from "../verify"

const { MockHTTPError, mockKyGet } = vi.hoisted(() => {
  class MockHTTPError extends Error {
    readonly response: { status: number }

    constructor(status: number) {
      super(`HTTP ${status}`)
      this.response = { status }
    }
  }

  return {
    MockHTTPError,
    mockKyGet: vi.fn(),
  }
})

vi.mock("ky", () => ({
  default: {
    get: mockKyGet,
  },
  HTTPError: MockHTTPError,
}))

describe("verifyAiProviderApiKey", () => {
  beforeEach(() => {
    mockKyGet.mockReset()
  })

  test("returns valid after OpenRouter accepts the credential", async () => {
    mockKyGet.mockResolvedValueOnce({})

    await expect(verifyAiProviderApiKey("openrouter", "or-key")).resolves.toBe(
      "valid",
    )

    expect(mockKyGet).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/key",
      expect.objectContaining({
        headers: { Authorization: "Bearer or-key" },
      }),
    )
  })

  test.each([
    [
      "claude",
      "https://api.anthropic.com/v1/models",
      {
        "anthropic-version": "2023-06-01",
        "x-api-key": "provider-key",
      },
    ],
    [
      "gemini",
      "https://generativelanguage.googleapis.com/v1beta/models?key=provider-key",
      undefined,
    ],
  ] as const)("uses the provider-specific probe for %s", async (provider, url, headers) => {
    mockKyGet.mockResolvedValueOnce({})

    await expect(
      verifyAiProviderApiKey(provider, "provider-key"),
    ).resolves.toBe("valid")

    expect(mockKyGet).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ headers }),
    )
  })

  test.each([
    401, 403,
  ])("returns invalid when the provider explicitly rejects credentials with %i", async (status) => {
    mockKyGet.mockRejectedValueOnce(new MockHTTPError(status))

    await expect(verifyAiProviderApiKey("openrouter", "bad-key")).resolves.toBe(
      "invalid",
    )
  })

  test.each([
    new MockHTTPError(429),
    new MockHTTPError(503),
    new Error("network unavailable"),
  ])("returns unknown for an inconclusive provider response", async (error) => {
    mockKyGet.mockRejectedValueOnce(error)

    await expect(
      verifyAiProviderApiKey("openrouter", "possibly-valid-key"),
    ).resolves.toBe("unknown")
  })
})
