import { beforeEach, describe, expect, test, vi } from "vitest"
import type { WhatsappAuthValue } from "../src/schema"

const { apiGetMock, apiPostMock } = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  apiPostMock: vi.fn(),
}))

vi.mock("ky", async () => {
  const actual = await vi.importActual<typeof import("ky")>("ky")
  return {
    ...actual,
    default: {
      create: vi.fn(() => ({
        get: apiGetMock,
        post: apiPostMock,
      })),
    },
  }
})

const { registerPhoneNumber } = await import("../src/api/waba-setup")

const auth = {
  tokens: { accessToken: "token-1" },
  metadata: { wabaId: "1000" },
  version: "v23.0",
} as unknown as WhatsappAuthValue

const phoneNumbersResponse = (
  data: Array<{ id: string; code_verification_status: string }>,
) => ({
  json: vi.fn().mockResolvedValue({ data }),
})

describe("registerPhoneNumber", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiPostMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({ success: true }),
    })
  })

  test("registers the selected verified phone number in a multi-number WABA", async () => {
    apiGetMock.mockReturnValueOnce(
      phoneNumbersResponse([
        { id: "2001", code_verification_status: "NOT_VERIFIED" },
        { id: "2002", code_verification_status: "VERIFIED" },
      ]),
    )

    const result = await registerPhoneNumber({
      auth,
      phoneNumberId: "2002",
    })

    expect(result).toEqual({ status: "registered" })
    expect(apiPostMock).toHaveBeenCalledTimes(1)
    expect(apiPostMock).toHaveBeenCalledWith(
      expect.stringContaining("/2002/register"),
      expect.objectContaining({
        headers: { Authorization: "Bearer token-1" },
        json: expect.objectContaining({ messaging_product: "whatsapp" }),
      }),
    )
  })

  test("does not register a different number when the selected phone number is missing", async () => {
    apiGetMock.mockReturnValueOnce(
      phoneNumbersResponse([
        { id: "2003", code_verification_status: "VERIFIED" },
      ]),
    )

    const result = await registerPhoneNumber({
      auth,
      phoneNumberId: "2004",
    })

    expect(result).toMatchObject({ status: "failed" })
    expect(apiPostMock).not.toHaveBeenCalled()
  })
})
