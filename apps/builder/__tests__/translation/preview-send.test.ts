import { describe, expect, test } from "vitest"
import type { TranslationPreview } from "@/features/translation/hooks/use-translation-preview"
import { decidePreviewSend } from "@/features/translation/lib/preview-send"

const ready = (
  overrides: Partial<{ sourceText: string; language: string }> = {},
) =>
  ({
    status: "ready",
    translated: "Xin chào",
    sourceText: "Hello",
    language: "vi",
    ...overrides,
  }) as TranslationPreview

const decide = (
  overrides: Partial<Parameters<typeof decidePreviewSend>[0]> = {},
) =>
  decidePreviewSend({
    previewEnabled: true,
    translationActive: true,
    text: "Hello",
    language: "vi",
    preview: { status: "idle" },
    ...overrides,
  })

describe("decidePreviewSend", () => {
  test("the first Enter translates and shows the preview", () => {
    expect(decide()).toBe("translate")
  })

  test("the next Enter sends the translation that was shown", () => {
    expect(decide({ preview: ready() })).toBe("send")
  })

  test("a sentence or language that moved on since the preview translates again", () => {
    expect(decide({ preview: ready({ sourceText: "Hello there" }) })).toBe(
      "translate",
    )
    expect(decide({ preview: ready({ language: "es" }) })).toBe("translate")
    expect(
      decide({
        preview: {
          status: "stale",
          translated: "Xin chào",
          sourceText: "Hello",
          language: "vi",
        },
      }),
    ).toBe("translate")
  })

  test("an Enter while a translation is on its way does nothing", () => {
    expect(decide({ preview: { status: "loading" } })).toBe("wait")
  })

  test("a failed preview does not trap the agent: Enter sends and the server translates", () => {
    expect(decide({ preview: { status: "failed" } })).toBe("send")
  })

  test("the surrounding spaces of the sentence do not matter", () => {
    expect(decide({ text: "  Hello \n", preview: ready() })).toBe("send")
  })

  test.each([
    ["preview off", { previewEnabled: false }],
    [
      "translation not active for the conversation",
      { translationActive: false },
    ],
    ["nothing typed", { text: "   " }],
  ])("%s: Enter sends as it always did", (_name, overrides) => {
    expect(decide(overrides)).toBe("send")
  })
})
