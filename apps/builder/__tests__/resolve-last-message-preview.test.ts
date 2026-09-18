// @vitest-environment node
import { createTranslator } from "next-intl"
import { describe, expect, test } from "vitest"
import messages from "../messages/en.json"
import {
  resolveCallPreviewKind,
  resolveLastMessagePreview,
} from "../src/features/conversations/queries/resolve-last-message-preview"

const t = createTranslator({ locale: "en", messages })

const callMessage = (
  overrides: Partial<{
    status: "completed" | "failed" | "rejected" | "canceled"
    direction: "userInitiated" | "businessInitiated"
    durationSeconds: number
  }> = {},
) =>
  ({
    text: "Voice call",
    contentAttributes: {
      type: "whatsapp_call",
      direction: "userInitiated",
      status: "completed",
      ...overrides,
    },
  }) as never

describe("resolveLastMessagePreview", () => {
  test("uses the message text when present, even if attachments exist", () => {
    const result = resolveLastMessagePreview(
      { text: "Hello", attachmentCount: 3 } as never,
      t,
    )
    expect(result).toBe("Hello")
  })

  test("falls back to a singular attachment label when count is 1", () => {
    const result = resolveLastMessagePreview(
      { text: "", attachmentCount: 1 } as never,
      t,
    )
    expect(result).toBe("Sent 1 attachment")
  })

  test("falls back to a plural attachment label when count is more than 1", () => {
    const result = resolveLastMessagePreview(
      { text: "", attachmentCount: 2 } as never,
      t,
    )
    expect(result).toBe("Sent 2 attachments")
  })

  test("falls back to attachments.length when attachmentCount is absent", () => {
    const result = resolveLastMessagePreview(
      { text: "", attachments: [{}, {}] } as never,
      t,
    )
    expect(result).toBe("Sent 2 attachments")
  })

  test("renders a single space when there is no text and no attachments", () => {
    const result = resolveLastMessagePreview(
      { text: "", attachmentCount: 0 } as never,
      t,
    )
    expect(result).toBe(" ")
  })

  test("renders a single space when message is undefined", () => {
    const result = resolveLastMessagePreview(undefined, t)
    expect(result).toBe(" ")
  })

  test("a completed call with no duration uses the plain 'Voice call' label, ignoring the stored English text", () => {
    const result = resolveLastMessagePreview(
      callMessage({ status: "completed" }),
      t,
    )
    expect(result).toBe("Voice call")
  })

  test("a completed call WITH a duration uses the localized duration label formatted mm:ss", () => {
    const result = resolveLastMessagePreview(
      callMessage({ status: "completed", durationSeconds: 65 }),
      t,
    )
    expect(result).toBe("Voice call · 1:05")
  })

  test("a completed inbound call under 1 minute pads the seconds", () => {
    const result = resolveLastMessagePreview(
      callMessage({ status: "completed", durationSeconds: 5 }),
      t,
    )
    expect(result).toBe("Voice call · 0:05")
  })

  // A-L3 (Fable review) — the existing "completed WITH a duration" test only
  // exercised the default (inbound, `userInitiated`) direction; the preview
  // must render the same localized duration label for an outbound
  // (`businessInitiated`) completed call too.
  test("an outbound (businessInitiated) completed call WITH a duration uses the same localized duration label", () => {
    const result = resolveLastMessagePreview(
      callMessage({
        status: "completed",
        direction: "businessInitiated",
        durationSeconds: 65,
      }),
      t,
    )
    expect(result).toBe("Voice call · 1:05")
  })

  test.each([
    ["missed", "userInitiated" as const, "Missed voice call"],
    ["unanswered", "businessInitiated" as const, "No answer"],
    ["declined", "rejected" as const, "Declined voice call"],
    ["canceled", "canceled" as const, "Cancelled call"],
  ] as const)("%s call uses the shared activity label key, both directions", (_case, statusOrDirection, expected) => {
    const isDirection =
      statusOrDirection === "userInitiated" ||
      statusOrDirection === "businessInitiated"
    const result = resolveLastMessagePreview(
      callMessage(
        isDirection
          ? { status: "failed", direction: statusOrDirection }
          : { status: statusOrDirection },
      ),
      t,
    )
    expect(result).toBe(expected)
  })

  test("a non-call message keeps today's text fallback unchanged", () => {
    const result = resolveLastMessagePreview(
      { text: "Hi there", contentAttributes: { type: "text" } } as never,
      t,
    )
    expect(result).toBe("Hi there")
  })

  test("a non-call message with no text keeps the attachment fallback unchanged", () => {
    const result = resolveLastMessagePreview(
      {
        text: "",
        attachmentCount: 1,
        contentAttributes: { type: "text" },
      } as never,
      t,
    )
    expect(result).toBe("Sent 1 attachment")
  })
})

describe("resolveCallPreviewKind", () => {
  test("returns completedInbound for a completed userInitiated call", () => {
    expect(resolveCallPreviewKind(callMessage({ status: "completed" }))).toBe(
      "completedInbound",
    )
  })

  test("returns completedOutbound for a completed businessInitiated call", () => {
    expect(
      resolveCallPreviewKind(
        callMessage({ status: "completed", direction: "businessInitiated" }),
      ),
    ).toBe("completedOutbound")
  })

  test.each([
    ["failed", "userInitiated" as const, "missedVoiceCall"],
    ["failed", "businessInitiated" as const, "unansweredVoiceCall"],
    ["rejected", "userInitiated" as const, "declinedVoiceCall"],
    ["canceled", "businessInitiated" as const, "canceledVoiceCall"],
  ] as const)("returns %s/%s -> %s", (status, direction, expected) => {
    expect(resolveCallPreviewKind(callMessage({ status, direction }))).toBe(
      expected,
    )
  })

  test("returns undefined for a non-call message", () => {
    expect(
      resolveCallPreviewKind({
        text: "Hi",
        contentAttributes: { type: "text" },
      } as never),
    ).toBeUndefined()
  })

  test("returns undefined for an undefined message", () => {
    expect(resolveCallPreviewKind(undefined)).toBeUndefined()
  })
})
