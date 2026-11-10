// @vitest-environment node

import { smtpProviders } from "@chatbotx.io/integration-smtp/schema"
import { describe, expect, test } from "vitest"
import en from "../messages/en.json"
import { setupGuideContent } from "../src/features/integration-smtp/lib/setup-guide-content"
import { getEmailSubject } from "../src/features/messages/lib/get-email-subject"

const lookup = (key: string): unknown =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      en,
    )

describe("setup guide content", () => {
  test("every provider has a guide, and every referenced key exists in en.json", () => {
    for (const provider of smtpProviders.options) {
      const content: {
        steps: readonly string[]
        note?: string
        docsUrl?: string
      } = setupGuideContent[provider]
      expect(content.steps.length).toBeGreaterThan(0)
      for (const key of [
        ...content.steps,
        ...(content.note ? [content.note] : []),
      ]) {
        expect(typeof lookup(key), `${provider}: ${key}`).toBe("string")
      }
    }
  })

  test("doc links are https", () => {
    for (const provider of smtpProviders.options) {
      const content: { steps: readonly string[]; docsUrl?: string } =
        setupGuideContent[provider]
      if (content.docsUrl) {
        expect(content.docsUrl.startsWith("https://")).toBe(true)
      }
    }
  })
})

describe("getEmailSubject", () => {
  test("reads the subject of an email message", () => {
    expect(getEmailSubject({ email: { subject: "  Order #1 " } })).toBe(
      "Order #1",
    )
  })

  test("ignores anything that is not an email subject", () => {
    expect(getEmailSubject(null)).toBeUndefined()
    expect(getEmailSubject({ email: null })).toBeUndefined()
    expect(getEmailSubject({ email: { subject: "   " } })).toBeUndefined()
    expect(getEmailSubject({ type: "story_reply" })).toBeUndefined()
  })
})
