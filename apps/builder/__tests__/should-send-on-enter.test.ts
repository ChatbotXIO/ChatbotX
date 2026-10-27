import { describe, expect, test } from "vitest"
import { shouldSendOnEnter } from "@/lib/keyboard/should-send-on-enter"

const createKeyboardEvent = (
  key: string,
  options: { isComposing?: boolean; shiftKey?: boolean } = {},
) => ({
  key,
  nativeEvent: { isComposing: options.isComposing ?? false },
  shiftKey: options.shiftKey ?? false,
})

describe("shouldSendOnEnter", () => {
  test("sends Enter on a desktop keyboard", () => {
    expect(shouldSendOnEnter(createKeyboardEvent("Enter"), false)).toBe(true)
  })

  test("keeps Shift+Enter as a newline", () => {
    expect(
      shouldSendOnEnter(
        createKeyboardEvent("Enter", { shiftKey: true }),
        false,
      ),
    ).toBe(false)
  })

  test("keeps Enter as a newline on touch devices", () => {
    expect(shouldSendOnEnter(createKeyboardEvent("Enter"), true)).toBe(false)
  })

  test("does not send while an IME is composing", () => {
    expect(
      shouldSendOnEnter(
        createKeyboardEvent("Enter", { isComposing: true }),
        false,
      ),
    ).toBe(false)
  })

  test("does not send the IME Process key or other keys", () => {
    expect(shouldSendOnEnter(createKeyboardEvent("Process"), false)).toBe(false)
    expect(shouldSendOnEnter(createKeyboardEvent("a"), false)).toBe(false)
  })
})
