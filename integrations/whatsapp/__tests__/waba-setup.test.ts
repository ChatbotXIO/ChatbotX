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
      get: apiGetMock,
      create: vi.fn(() => ({
        post: apiPostMock,
      })),
    },
  }
})

const { requestVerificationCode, verifyCode } = await import(
  "../src/api/verification"
)
const { registerPhoneNumber } = await import("../src/api/waba-setup")

const auth = {
  tokens: { accessToken: "token-1" },
  metadata: { wabaId: "1000" },
  version: "v23.0",
} as unknown as WhatsappAuthValue

const phoneNumbersResponse = (
  data: Array<{ id: string; code_verification_status: string }>,
  next?: string,
) => ({
  json: vi.fn().mockResolvedValue({
    data,
    paging: { cursors: { before: "", after: "" }, ...(next ? { next } : {}) },
  }),
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

  test("requires phone verification before register when Meta marks the phone as not verified", async () => {
    apiGetMock.mockReturnValueOnce(
      phoneNumbersResponse([
        { id: "2004", code_verification_status: "NOT_VERIFIED" },
      ]),
    )

    const result = await registerPhoneNumber({
      auth,
      phoneNumberId: "2004",
    })

    expect(result.status).toBe("verification_required")
    expect(apiPostMock).not.toHaveBeenCalled()
  })

  test("registers a selected phone number that appears after the first page", async () => {
    apiGetMock
      .mockReturnValueOnce(
        phoneNumbersResponse(
          [{ id: "2005", code_verification_status: "VERIFIED" }],
          "https://graph.facebook.com/v23.0/1000/phone_numbers?after=page-2",
        ),
      )
      .mockReturnValueOnce(
        phoneNumbersResponse([
          { id: "2006", code_verification_status: "VERIFIED" },
        ]),
      )

    const result = await registerPhoneNumber({
      auth,
      phoneNumberId: "2006",
    })

    expect(result).toEqual({ status: "registered" })
    expect(apiGetMock).toHaveBeenCalledTimes(2)
    expect(apiPostMock).toHaveBeenCalledWith(
      expect.stringContaining("/2006/register"),
      expect.anything(),
    )
  })

  test("returns verification_required for Meta phone-not-verified subcode", async () => {
    apiGetMock.mockReturnValueOnce(
      phoneNumbersResponse([
        { id: "2007", code_verification_status: "VERIFIED" },
      ]),
    )
    apiPostMock.mockRejectedValueOnce({
      response: {
        error: {
          message: "Invalid parameter",
          type: "OAuthException",
          code: 100,
          error_subcode: 2_593_005,
          error_user_title: "Phone number is not verified",
          error_user_msg: "Phone number is not verified through SMS or voice.",
          fbtrace_id: "trace-1",
        },
      },
    })

    const result = await registerPhoneNumber({
      auth,
      phoneNumberId: "2007",
    })

    expect(result.status).toBe("verification_required")
    if (result.status !== "verification_required") {
      throw new Error("Expected verification-required registration")
    }
    expect(result.error.getOriginError()).toEqual({
      userTitle: "Phone number is not verified",
      userMessage: "Phone number is not verified through SMS or voice.",
      fbtraceId: "trace-1",
    })
  })
})

describe("phone number verification", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiPostMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({ success: true }),
    })
  })

  test("requests a verification code for the selected phone number", async () => {
    await requestVerificationCode({
      auth,
      phoneNumberId: "2008",
      codeMethod: "SMS",
      language: "en_US",
    })

    expect(apiPostMock).toHaveBeenCalledWith(
      expect.stringContaining("/2008/request_code"),
      expect.objectContaining({
        headers: { Authorization: "Bearer token-1" },
        json: {
          code_method: "SMS",
          language: "en_US",
        },
      }),
    )
  })

  test("submits a verification code for the selected phone number", async () => {
    await verifyCode({
      auth,
      phoneNumberId: "2009",
      code: "123456",
    })

    expect(apiPostMock).toHaveBeenCalledWith(
      expect.stringContaining("/2009/verify_code"),
      expect.objectContaining({
        headers: { Authorization: "Bearer token-1" },
        json: {
          code: "123456",
        },
      }),
    )
  })
})
