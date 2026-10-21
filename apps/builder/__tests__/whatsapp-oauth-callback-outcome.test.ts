import { describe, expect, test } from "vitest"
import {
  WA_OAUTH_RESULT,
  whatsappCallbackOutcome,
} from "@/features/integration-whatsapp/libs/embedded-signup"

describe("whatsappCallbackOutcome", () => {
  test("a code relays success and says signup is done", () => {
    expect(whatsappCallbackOutcome({ code: "abc", error: null })).toEqual({
      result: { type: WA_OAUTH_RESULT, status: "success", code: "abc" },
      messageKey: "embeddedSignupDone",
    })
  })

  test("access_denied relays a cancellation and never claims signup completed", () => {
    expect(
      whatsappCallbackOutcome({ code: null, error: "access_denied" }),
    ).toEqual({
      result: { type: WA_OAUTH_RESULT, status: "cancelled" },
      messageKey: "embeddedSignupCancelled",
    })
  })

  test("any other provider error relays a failure", () => {
    expect(
      whatsappCallbackOutcome({ code: null, error: "server_error" }),
    ).toEqual({
      result: { type: WA_OAUTH_RESULT, status: "error" },
      messageKey: "embeddedSignupFailed",
    })
  })

  test("an error wins over a code that came with it", () => {
    expect(
      whatsappCallbackOutcome({ code: "abc", error: "server_error" }).result
        .status,
    ).toBe("error")
  })

  test("no code and no error is a failure, not a success", () => {
    expect(
      whatsappCallbackOutcome({ code: null, error: null }).messageKey,
    ).toBe("embeddedSignupFailed")
  })
})
