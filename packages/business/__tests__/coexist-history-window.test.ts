import { describe, expect, test } from "vitest"
import {
  COEXIST_HISTORY_DECLINED_ERROR,
  COEXIST_HISTORY_TIMEOUT_ERROR,
  isWhatsappHistoryTerminal,
  WHATSAPP_COEXIST_HISTORY_WINDOW_MS,
} from "../src/coexist/history-window"

describe("isWhatsappHistoryTerminal", () => {
  test("phase 2 at 100% progress is the terminal chunk", () => {
    expect(isWhatsappHistoryTerminal({ lastPhase: 2, syncProgress: 100 })).toBe(
      true,
    )
  })

  test("phase 2 below 100% progress is not terminal", () => {
    expect(isWhatsappHistoryTerminal({ lastPhase: 2, syncProgress: 40 })).toBe(
      false,
    )
  })

  test("an earlier phase at 100% progress is not terminal", () => {
    expect(isWhatsappHistoryTerminal({ lastPhase: 1, syncProgress: 100 })).toBe(
      false,
    )
    expect(isWhatsappHistoryTerminal({ lastPhase: 0, syncProgress: 100 })).toBe(
      false,
    )
  })

  test("a run that has seen no history metadata is not terminal", () => {
    expect(
      isWhatsappHistoryTerminal({ lastPhase: null, syncProgress: 0 }),
    ).toBe(false)
    expect(
      isWhatsappHistoryTerminal({ lastPhase: undefined, syncProgress: 100 }),
    ).toBe(false)
    expect(
      isWhatsappHistoryTerminal({ lastPhase: 2, syncProgress: null }),
    ).toBe(false)
  })

  test("a future phase beyond 2 still counts as terminal", () => {
    expect(isWhatsappHistoryTerminal({ lastPhase: 3, syncProgress: 100 })).toBe(
      true,
    )
  })
})

describe("currentError sentinels", () => {
  test("are stable machine-readable markers", () => {
    expect(COEXIST_HISTORY_DECLINED_ERROR).toBe("history_declined")
    expect(COEXIST_HISTORY_TIMEOUT_ERROR).toBe("history_timeout")
  })

  test("the history window is 24 hours", () => {
    expect(WHATSAPP_COEXIST_HISTORY_WINDOW_MS).toBe(24 * 60 * 60 * 1000)
  })
})
