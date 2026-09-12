import { describe, expect, test } from "vitest"
import {
  HANGUP_CAUSE_TO_STATUS,
  hangupCauses,
  resolveTerminalStatus,
  SIP_TERM_STATUS_TO_ERROR,
} from "../src/whatsapp-call/hangup-cause"

describe("resolveTerminalStatus", () => {
  test("NORMAL_CLEARING after accepted -> completed", () => {
    expect(
      resolveTerminalStatus({
        cause: "NORMAL_CLEARING",
        priorStatus: "accepted",
      }),
    ).toBe("completed")
  })

  test("NORMAL_CLEARING on a never-accepted call -> failed (rendered as missed)", () => {
    expect(
      resolveTerminalStatus({
        cause: "NORMAL_CLEARING",
        priorStatus: "ringing",
      }),
    ).toBe("failed")
  })

  test.each(
    Object.entries(HANGUP_CAUSE_TO_STATUS),
  )("%s -> %s (every non-NORMAL_CLEARING table row)", (cause, status) => {
    expect(resolveTerminalStatus({ cause, priorStatus: "ringing" })).toBe(
      status,
    )
  })

  test("an unrecognized cause defaults to failed", () => {
    expect(
      resolveTerminalStatus({
        cause: "SOMETHING_UNEXPECTED",
        priorStatus: "ringing",
      }),
    ).toBe("failed")
  })

  test("hangupCauses enum matches every HANGUP_CAUSE_TO_STATUS key plus NORMAL_CLEARING", () => {
    const expected = new Set([
      "NORMAL_CLEARING",
      ...Object.keys(HANGUP_CAUSE_TO_STATUS),
    ])
    expect(new Set(hangupCauses.options)).toEqual(expected)
  })
})

const I18N_KEY_RE = /^whatsapp\.calls\.errors\./

describe("SIP_TERM_STATUS_TO_ERROR", () => {
  test.each([
    "403",
    "407",
    "480",
    "486",
  ])("maps SIP status %s to an i18n key, not raw English text", (status) => {
    expect(SIP_TERM_STATUS_TO_ERROR[status]).toMatch(I18N_KEY_RE)
  })
})
