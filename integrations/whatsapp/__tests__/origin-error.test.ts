import { describe, expect, test } from "vitest"
import { readWhatsappOriginErrorDetail } from "../src/lib/origin-error"

describe("readWhatsappOriginErrorDetail", () => {
  test("reads Facebook user-facing fields from the Graph error payload", () => {
    expect(
      readWhatsappOriginErrorDetail({
        error: {
          error_user_title: "Code couldn't be sent",
          error_user_msg: "Request code failed: Please try again in some time.",
          fbtrace_id: "trace-1",
        },
      }),
    ).toEqual({
      userTitle: "Code couldn't be sent",
      userMessage: "Request code failed: Please try again in some time.",
      fbtraceId: "trace-1",
    })
  })

  test("prefers fields already normalized by WhatsApp channel error mapping", () => {
    expect(
      readWhatsappOriginErrorDetail({
        userTitle: "Cannot send code",
        userMessage: "This number cannot receive SMS.",
        fbtraceId: "trace-2",
        error: {
          error_user_title: "Raw title",
          error_user_msg: "Raw message",
          fbtrace_id: "raw-trace",
        },
      }),
    ).toEqual({
      userTitle: "Cannot send code",
      userMessage: "This number cannot receive SMS.",
      fbtraceId: "trace-2",
    })
  })
})
