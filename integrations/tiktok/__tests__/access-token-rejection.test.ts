import { AuthException, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

const get = vi.fn()

vi.mock("../src/lib/http-client", () => ({
  createTiktokBusinessClient: () => ({ get, post: vi.fn() }),
}))

const { listTiktokComments } = await import("../src/apis/comment")
const {
  isAccessTokenRejection,
  TiktokAPIException,
  TiktokAuthException,
  throwBusinessApiError,
} = await import("../src/exception")
const { isRevokedTokenError, mapToChannelError } = await import(
  "../src/lib/error-mapper"
)

const EXPIRED_TOKEN_MESSAGE = "Access token is incorrect or has been revoked."

const thrownBy = (fn: () => unknown): unknown => {
  try {
    fn()
  } catch (error) {
    return error
  }
  throw new Error("expected a throw")
}

beforeEach(() => {
  vi.clearAllMocks()
})

// #1754: an expired TikTok token must surface as an `AuthException`, the one
// error the SDK answers by refreshing the token and retrying.
describe("TikTok access-token rejections", () => {
  test("the Business API's expired-token answer becomes a TiktokAuthException", async () => {
    get.mockResolvedValueOnce({ code: 40_105, message: EXPIRED_TOKEN_MESSAGE })

    const error = await listTiktokComments("token", {
      businessId: "biz-1",
      videoId: "video-1",
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TiktokAuthException)
    expect(error).toBeInstanceOf(AuthException)
    expect(error).toMatchObject({
      code: 40_105,
      message: EXPIRED_TOKEN_MESSAGE,
    })
  })

  test("is recognized by its wording when the code is unknown", () => {
    const error = thrownBy(() =>
      throwBusinessApiError(
        { code: 49_999, message: EXPIRED_TOKEN_MESSAGE },
        "failed",
      ),
    )

    expect(error).toBeInstanceOf(TiktokAuthException)
  })

  test("other rejections stay TiktokAPIException and keep TikTok's code", () => {
    const error = thrownBy(() =>
      throwBusinessApiError(
        { code: 40_002, message: "Comment does not exist" },
        "failed",
      ),
    )

    expect(error).toBeInstanceOf(TiktokAPIException)
    expect(error).not.toBeInstanceOf(AuthException)
    expect(error).toMatchObject({ code: 40_002 })
  })

  test("falls back to the endpoint message when TikTok sends none", () => {
    const error = thrownBy(() =>
      throwBusinessApiError({ code: 40_002 }, "business/comment/list failed"),
    )

    expect(error).toMatchObject({ message: "business/comment/list failed" })
  })

  test("an Open API 401 counts as a rejected access token", () => {
    expect(
      isAccessTokenRejection({
        httpStatusCode: 401,
        code: "access_token_invalid",
      }),
    ).toBe(true)
    expect(
      isAccessTokenRejection({ httpStatusCode: 400, message: "bad request" }),
    ).toBe(false)
  })

  test("maps to AUTH_FAILED and counts as revoked where a refresh was already tried", () => {
    const error = new TiktokAuthException(EXPIRED_TOKEN_MESSAGE, 401, 40_105)

    expect(mapToChannelError(error).category).toBe(
      ChannelErrorCategory.AUTH_FAILED,
    )
    expect(isRevokedTokenError(error)).toBe(true)
  })
})
