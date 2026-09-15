import { beforeEach, describe, expect, test, vi } from "vitest"

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

const { verifyAiProviderApiKey } = await import("../verify")

describe("verifyAiProviderApiKey", () => {
  beforeEach(() => {
    mockKyGet.mockReset()
  })

  test("checks OpenRouter credentials against the authenticated key endpoint", async () => {
    mockKyGet.mockResolvedValueOnce({})

    await expect(verifyAiProviderApiKey("openrouter", "or-key")).resolves.toBe(
      true,
    )

    expect(mockKyGet).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/key",
      expect.objectContaining({
        headers: { Authorization: "Bearer or-key" },
      }),
    )
  })

  test("rejects explicitly unauthorized provider responses", async () => {
    mockKyGet.mockRejectedValueOnce(new MockHTTPError(401))

    await expect(verifyAiProviderApiKey("openrouter", "bad-key")).resolves.toBe(
      false,
    )
  })

  test("does not block users on transient provider failures", async () => {
    mockKyGet.mockRejectedValueOnce(new Error("network unavailable"))

    await expect(
      verifyAiProviderApiKey("openrouter", "possibly-valid-key"),
    ).resolves.toBe(true)
  })
})
