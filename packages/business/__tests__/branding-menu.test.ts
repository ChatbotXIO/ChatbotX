import { describe, expect, test } from "vitest"
import {
  ensureBrandingMenuEntry,
  moveBrandingMenuLast,
} from "../src/platform/branding"

const BRANDING_URL = "https://app.chatbotx.io/?ref=selfhosted&channel=webchat"
const ENTRY = { label: "⚡ Built with chatbotx.io", url: BRANDING_URL }

describe("ensureBrandingMenuEntry", () => {
  test("appends the branding entry when absent", () => {
    const menus = [{ label: "Docs", type: "url", url: "https://docs.x" }]

    const result = ensureBrandingMenuEntry(menus, ENTRY)

    expect(result).toHaveLength(2)
    expect(result.at(-1)).toEqual({
      label: ENTRY.label,
      type: "url",
      url: BRANDING_URL,
    })
  })

  test("appends to an empty menu list", () => {
    expect(ensureBrandingMenuEntry([], ENTRY)).toEqual([
      { label: ENTRY.label, type: "url", url: BRANDING_URL },
    ])
  })

  test("is a no-op when the branding url is already present", () => {
    const menus = [
      { label: "custom label kept", type: "url", url: BRANDING_URL },
      { label: "Docs", type: "url", url: "https://docs.x" },
    ]

    const result = ensureBrandingMenuEntry(menus, ENTRY)

    expect(result).toEqual(menus)
  })

  test("does not match non-url entries and never mutates the input", () => {
    const menus = [{ label: "Start", type: "flow", url: BRANDING_URL }]

    const result = ensureBrandingMenuEntry(menus, ENTRY)

    expect(result).toHaveLength(2)
    expect(menus).toHaveLength(1)
  })

  test("composes with moveBrandingMenuLast", () => {
    const menus = [
      { label: ENTRY.label, type: "url", url: BRANDING_URL },
      { label: "Docs", type: "url", url: "https://docs.x" },
    ]

    const result = moveBrandingMenuLast(
      ensureBrandingMenuEntry(menus, ENTRY),
      BRANDING_URL,
    )

    expect(result.at(-1)?.url).toBe(BRANDING_URL)
    expect(result).toHaveLength(2)
  })
})
