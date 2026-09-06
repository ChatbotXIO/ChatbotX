import { describe, expect, test } from "vitest"
import { parseOriginError } from "../src/exception"
import { mapToChannelError } from "../src/lib/error-mapper"

/**
 * The Graph body Meta returns when a Page is temporarily restricted from
 * messaging a thread. Every piece of it has to survive into `ErrorLog.detail`:
 * code 10 alone covers a dozen unrelated permission failures, and the subcode
 * is the only thing that names this one.
 */
const RESTRICTED_THREAD_ERROR = {
  message: "Application does not have permission for this action",
  type: "OAuthException",
  code: 10,
  error_subcode: 1_893_063,
  error_user_title: "Bạn không thể gửi tin nhắn đến cuộc trò chuyện này",
  error_user_msg:
    "Bạn tạm thời bị hạn chế gửi tin nhắn. Tìm hiểu thêm về thời gian và lý do chúng tôi hạn chế khả năng nhắn tin.",
  fbtrace_id: "Ae1wFHiG1XvSn1TtWwjWxPZ",
}

const EXPECTED_DETAIL =
  "#(10 - 1893063) Application does not have permission for this action. Bạn tạm thời bị hạn chế gửi tin nhắn. Tìm hiểu thêm về thời gian và lý do chúng tôi hạn chế khả năng nhắn tin."

describe("parseOriginError message composition", () => {
  test("keeps the code pair and both sentences of a restricted-thread failure", () => {
    expect(
      parseOriginError({
        httpStatus: 403,
        errorBody: { error: RESTRICTED_THREAD_ERROR },
      }),
    ).toMatchObject({
      httpStatusCode: 403,
      code: 10,
      subCode: 1_893_063,
      type: "OAuthException",
      message: EXPECTED_DETAIL,
    })
  })

  test("composes the same string from the explicit response shape", () => {
    expect(
      parseOriginError({ response: { error: RESTRICTED_THREAD_ERROR } }),
    ).toMatchObject({ message: EXPECTED_DETAIL })
  })

  test("falls back to the user title when Meta sent no user message", () => {
    expect(
      parseOriginError({
        httpStatus: 400,
        errorBody: {
          error: {
            message: "Invalid parameter",
            code: 100,
            error_subcode: 2_018_001,
            error_user_title: "Message not sent",
          },
        },
      }),
    ).toMatchObject({
      message: "#(100 - 2018001) Invalid parameter. Message not sent",
    })
  })

  test("adds no prefix to a failure that never reached Graph", () => {
    expect(parseOriginError(new Error("socket hang up"))).toMatchObject({
      httpStatusCode: 400,
      message: "socket hang up",
    })
  })
})

describe("the string that reaches ErrorLog.detail", () => {
  /**
   * `toEntry` in `@chatbotx.io/business` writes `error.message` verbatim into
   * `ErrorLog.detail`, and `parseSdkError` is what hands it over. Nothing
   * between here and the row re-derives the message, so pinning it at
   * `getErrorData()` pins the column.
   */
  test("survives mapToChannelError and getErrorData unchanged", async () => {
    const channelError = mapToChannelError({
      httpStatus: 403,
      errorBody: { error: RESTRICTED_THREAD_ERROR },
    })

    expect(channelError.message).toBe(EXPECTED_DETAIL)

    const errorData = await channelError.getErrorData()
    expect(errorData).toMatchObject({
      message: EXPECTED_DETAIL,
      code: 10,
      subcode: 1_893_063,
      statusCode: 403,
      // Terminal, so `recordProviderErrorLog` writes the row on this emission.
      isRetryable: false,
    })
  })
})
