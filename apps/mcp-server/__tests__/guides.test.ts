import { describe, expect, test } from "vitest"
import { getGuide, guideNames } from "../src/guides"

const MARKDOWN_HEADING_PATTERN = /^# /u

describe("MCP guides", () => {
  test.each(guideNames)("loads %s as markdown", (name) => {
    const guide = getGuide(name)

    expect(guide.content).toMatch(MARKDOWN_HEADING_PATTERN)
    expect(guide.content.trim()).not.toBe("")
    expect(guide.uri).toBe(`chatbotx://guides/${name}`)
  })
})
