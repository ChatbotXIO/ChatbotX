import { describe, expect, test } from "vitest"
import {
  buttonStyleMenuOptions,
  displayedButtonStyle,
  resolveButtonStylePicker,
} from "../button-style-field"

const lineSupport = {
  options: ["primary", "secondary", "link"],
  default: "link",
} as const

describe("buttonStyleMenuOptions", () => {
  test("lists every style but the default, which the (default) entry covers", () => {
    expect(
      buttonStyleMenuOptions({
        ...lineSupport,
        options: [...lineSupport.options],
      }),
    ).toEqual(["primary", "secondary"])
  })
})

describe("displayedButtonStyle", () => {
  const support = { ...lineSupport, options: [...lineSupport.options] }

  test("an unset style shows as the (default) entry", () => {
    expect(displayedButtonStyle(undefined, support)).toBe("")
  })

  test("the default style set explicitly also shows as the (default) entry", () => {
    expect(displayedButtonStyle("link", support)).toBe("")
  })

  test("any other style shows as itself", () => {
    expect(displayedButtonStyle("primary", support)).toBe("primary")
  })
})

describe("resolveButtonStylePicker", () => {
  test("offers the three styles, default link, on a LINE step or card button", () => {
    expect(
      resolveButtonStylePicker({ channel: "line", isQuickReply: false }),
    ).toEqual({ options: ["primary", "secondary", "link"], default: "link" })
  })

  test("is hidden for a LINE quick reply", () => {
    expect(
      resolveButtonStylePicker({ channel: "line", isQuickReply: true }),
    ).toBeNull()
  })

  test("is hidden on every channel whose policy declares no styles", () => {
    for (const channel of [
      "omnichannel",
      "messenger",
      "telegram",
      "whatsapp",
      undefined,
      "legacy",
    ]) {
      expect(
        resolveButtonStylePicker({ channel, isQuickReply: false }),
      ).toBeNull()
    }
  })
})
