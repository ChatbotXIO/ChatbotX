import { describe, expect, test } from "vitest"
import { buildPageWelcomeMessage } from "../src/messaging-ads/welcome-message"

describe("buildPageWelcomeMessage", () => {
  test("default returns undefined (Meta applies its own default text)", () => {
    expect(buildPageWelcomeMessage({ type: "default" })).toBeUndefined()
  })

  test("single message assembles a VISUAL_EDITOR text payload", () => {
    const result = buildPageWelcomeMessage({
      type: "single",
      message: "Hi! How can we help?",
      quickReplies: [{ title: "Pricing" }, { title: "Support" }],
    })
    expect(result).toBeDefined()
    const parsed = JSON.parse(result as string)
    expect(parsed.type).toBe("VISUAL_EDITOR")
    expect(parsed.landing_screen_type).toBe("welcome_message")
    expect(parsed.text_format.content.title).toBe("Hi! How can we help?")
    expect(parsed.text_format.content.quick_replies).toEqual([
      { title: "Pricing" },
      { title: "Support" },
    ])
  })

  test("a single template collapses to one object, not a wrapping array", () => {
    const result = buildPageWelcomeMessage({
      type: "templates",
      templates: [{ message: "Hello there" }],
    })
    const parsed = JSON.parse(result as string)
    expect(Array.isArray(parsed)).toBe(false)
    expect(parsed.text_format.content.message).toBe("Hello there")
  })

  test("up to 5 templates serialize as an array, capped at 5", () => {
    const templates = Array.from({ length: 7 }, (_unused, index) => ({
      message: `Template ${index}`,
    }))
    const result = buildPageWelcomeMessage({ type: "templates", templates })
    const parsed = JSON.parse(result as string)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(5)
    expect(parsed[0].text_format.content.message).toBe("Template 0")
    expect(parsed[4].text_format.content.message).toBe("Template 4")
  })
})
