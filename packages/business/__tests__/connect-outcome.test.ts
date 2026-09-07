import { SdkException } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import {
  ChatbotXException,
  channelDuplicatedException,
  channelLimitReachedException,
  connectSessionExpiredException,
  notWorkspaceMemberException,
  workspaceLimitReachedException,
} from "../src/errors"
import {
  CONNECT_SESSION_ERROR_CODES,
  MAX_CONNECT_DETAIL_LENGTH,
  providerDetailFrom,
  toConnectItemFailure,
  toConnectSessionError,
} from "../src/inbox/connect-outcome"

describe("toConnectItemFailure", () => {
  test("maps channelDuplicated to duplicated/alreadyConnected", () => {
    expect(toConnectItemFailure(channelDuplicatedException())).toEqual({
      status: "duplicated",
      reason: "alreadyConnected",
    })
  })

  test("maps channelLimitReached to limitReached/channelLimit", () => {
    expect(toConnectItemFailure(channelLimitReachedException())).toEqual({
      status: "limitReached",
      reason: "channelLimit",
    })
  })

  test("maps workspaceLimitReached to limitReached/workspaceLimit", () => {
    expect(toConnectItemFailure(workspaceLimitReachedException())).toEqual({
      status: "limitReached",
      reason: "workspaceLimit",
    })
  })

  test("maps an SdkException to failed/providerRejected, carrying Meta's end-user sentence as the detail", () => {
    const error = new SdkException("(#100) Invalid parameter").setOriginError({
      error: {
        error_user_msg: "WhatsApp accounts cannot be used with this API.",
      },
    })

    expect(toConnectItemFailure(error)).toEqual({
      status: "failed",
      reason: "providerRejected",
      detail: "WhatsApp accounts cannot be used with this API.",
    })
  })

  test("maps a bare SdkException (no provider body) to providerRejected with no detail", () => {
    expect(
      toConnectItemFailure(new SdkException("Meta rejected the request")),
    ).toEqual({ status: "failed", reason: "providerRejected" })
  })

  test("prefers the sentence Meta wrote for the end user over the mapper's generic message", () => {
    const error = new SdkException(
      "WhatsApp API call failed",
      100,
    ).setOriginError({
      error: {
        code: 100,
        error_subcode: 2_388_339,
        message: "(#100) Invalid parameter",
        error_user_title: "Invalid WhatsApp account usage",
        error_user_msg: "WhatsApp accounts cannot be used with this API.",
      },
    })

    expect(toConnectItemFailure(error)).toEqual({
      status: "failed",
      reason: "providerRejected",
      detail: "WhatsApp accounts cannot be used with this API.",
    })
  })

  test("never attaches a detail to a reason we authored ourselves", () => {
    expect(
      toConnectItemFailure(channelLimitReachedException()),
    ).not.toHaveProperty("detail")
  })

  test("maps an unrecognized exception code to failed/unknown", () => {
    expect(
      toConnectItemFailure(new ChatbotXException("boom", "somethingElse")),
    ).toEqual({ status: "failed", reason: "unknown" })
  })

  test("maps a plain Error to failed/unknown", () => {
    expect(toConnectItemFailure(new Error("boom"))).toEqual({
      status: "failed",
      reason: "unknown",
    })
  })

  test("maps a non-error thrown value to failed/unknown", () => {
    expect(toConnectItemFailure("boom")).toEqual({
      status: "failed",
      reason: "unknown",
    })
  })
})

describe("toConnectSessionError", () => {
  // Every entry of SESSION_ERROR_BY_EXCEPTION_CODE (packages/business/src/
  // inbox/connect-outcome.ts) must map to its session error code — this
  // table drives one assertion per exception code so a new/renamed entry in
  // that map can't go untested.
  const exceptionCodeToSessionError = [
    ["connectSessionExpired", CONNECT_SESSION_ERROR_CODES.sessionExpired],
    ["signupSessionExpired", CONNECT_SESSION_ERROR_CODES.sessionExpired],
    ["notWorkspaceMember", CONNECT_SESSION_ERROR_CODES.notMember],
    ["trialExpired", CONNECT_SESSION_ERROR_CODES.trialExpired],
    ["macLimitReached", CONNECT_SESSION_ERROR_CODES.macLimitReached],
    ["credentialMissing", CONNECT_SESSION_ERROR_CODES.credentialMissing],
  ] as const

  test.each(
    exceptionCodeToSessionError,
  )("maps exception code %s to session error %s", (code, expected) => {
    expect(toConnectSessionError(new ChatbotXException("boom", code))).toBe(
      expected,
    )
  })

  test("maps connectSessionExpiredException (default code) to sessionExpired", () => {
    expect(
      toConnectSessionError(connectSessionExpiredException("expired")),
    ).toBe(CONNECT_SESSION_ERROR_CODES.sessionExpired)
  })

  test("maps connectSessionExpiredException with the WhatsApp signup-session-expired code to sessionExpired", () => {
    expect(
      toConnectSessionError(
        connectSessionExpiredException("expired", "signupSessionExpired"),
      ),
    ).toBe(CONNECT_SESSION_ERROR_CODES.sessionExpired)
  })

  test("maps notWorkspaceMemberException to notMember", () => {
    expect(toConnectSessionError(notWorkspaceMemberException())).toBe(
      CONNECT_SESSION_ERROR_CODES.notMember,
    )
  })

  test("returns null for an item-level exception like channelDuplicated", () => {
    expect(toConnectSessionError(channelDuplicatedException())).toBeNull()
  })

  test("returns null for an unrecognized exception code", () => {
    expect(
      toConnectSessionError(new ChatbotXException("boom", "somethingElse")),
    ).toBeNull()
  })

  test("returns null for a non-ChatbotXException error", () => {
    expect(toConnectSessionError(new Error("boom"))).toBeNull()
  })
})

/**
 * The accessor `toConnectItemFailure` reads a `providerRejected` row's
 * `detail` through. `originError` reaches it in either of the two shapes the
 * integrations park there — normalized `{ userTitle, userMessage }` from a
 * channel error-mapper, or the raw Graph body `rescue()` re-parks — so both
 * are covered here alongside the message fallback and the length cap.
 */
describe("providerDetailFrom", () => {
  test("reads the normalized userMessage a channel error-mapper parks on originError", () => {
    const error = new SdkException("WhatsApp API call failed").setOriginError({
      userTitle: "Invalid WhatsApp account usage",
      userMessage: "WhatsApp accounts cannot be used with this API.",
    })

    expect(providerDetailFrom(error)).toBe(
      "WhatsApp accounts cannot be used with this API.",
    )
  })

  test("falls back to the normalized userTitle when there is no user message", () => {
    const error = new SdkException("Messenger API call failed").setOriginError({
      userTitle: "Missing Page permission",
    })

    expect(providerDetailFrom(error)).toBe("Missing Page permission")
  })

  // ky parks the parsed body on `data`; `rescue()` re-parks it as `errorBody`;
  // the explicit thrown shape nests it under `response`.
  test.each([
    "data",
    "errorBody",
    "response",
  ])("reads error_user_msg out of a raw Graph body nested under %s", (key) => {
    const error = new SdkException("WhatsApp API call failed").setOriginError({
      [key]: {
        error: {
          message: "(#100) Invalid parameter",
          error_user_msg: "Ask Meta.",
        },
      },
    })

    expect(providerDetailFrom(error)).toBe("Ask Meta.")
  })

  test("falls back to the provider message when Meta wrote no end-user sentence", () => {
    const error = new SdkException("(#100) Invalid parameter").setOriginError({
      error: { message: "(#100) Invalid parameter" },
    })

    expect(providerDetailFrom(error)).toBe("(#100) Invalid parameter")
  })

  test("returns undefined when there is neither a user message nor a provider message", () => {
    expect(providerDetailFrom(new SdkException(""))).toBeUndefined()
  })

  test("returns undefined for an error the provider never produced", () => {
    expect(providerDetailFrom(new Error("boom"))).toBeUndefined()
    expect(providerDetailFrom("boom")).toBeUndefined()
  })

  test("caps a long provider sentence at MAX_CONNECT_DETAIL_LENGTH", () => {
    const error = new SdkException("long").setOriginError({
      error: { error_user_msg: "x".repeat(300) },
    })

    expect(providerDetailFrom(error)).toHaveLength(MAX_CONNECT_DETAIL_LENGTH)
  })

  test("redacts a credential the provider echoed back into its own message", () => {
    const error = new SdkException("failed").setOriginError({
      error: {
        error_user_msg: "Request failed: Authorization: Bearer abc.def.ghi",
      },
    })

    expect(providerDetailFrom(error)).not.toContain("abc.def.ghi")
  })

  test("never surfaces the SDK exception's own message — a transport failure's message is the request URL", () => {
    const error = new SdkException(
      "TimeoutError: https://graph.facebook.com/v23.0/27354777577529205/assigned_users?user=1234",
    )

    expect(providerDetailFrom(error)).toBeUndefined()
  })

  test("strips any URL a provider sentence carries", () => {
    const error = new SdkException("failed").setOriginError({
      error: {
        error_user_msg:
          "See https://graph.facebook.com/v23.0/27354777577529205/assigned_users for details",
      },
    })

    const detail = providerDetailFrom(error)
    expect(detail).toBe("See [url] for details")
  })
})
