import { describe, expect, test } from "vitest"
import { resolveStepValidator } from "../src/channel-rules/channel-validator"
import {
  countMessageCharacters,
  resolveSendTextLengthLimits,
  SEND_TEXT_MAX,
} from "../src/channel-rules/send-text-length-rules"
import { sendTextValidator } from "../src/channel-rules/send-text-validator"
import { TIKTOK_CARD_TITLE_MAX } from "../src/channel-rules/tiktok-text-rules"
import { BUTTON_LABEL_MAX } from "../src/steps/button"
import { sendTextStepSchema } from "../src/steps/send-text"
import { flowValidationCodes } from "../src/validation-codes"

const step = (text: string, buttons: unknown[] = []) => ({
  buttons,
  id: "1",
  stepType: "sendText",
  text,
})

const parseForChannel = (channel: string, text: string) =>
  resolveStepValidator(sendTextValidator, channel).safeParse(step(text))

const issueCodes = (result: {
  success: boolean
  error?: { issues: { message: string }[] }
}) => result.error?.issues.map((issue) => issue.message) ?? []

describe("resolveSendTextLengthLimits", () => {
  test.each([
    ["messenger", 2000],
    ["telegram", 4096],
    // The plain-text limit, not the 1024 of an interactive body: a button-less
    // step sends one `Text`, and a body with buttons is split across messages.
    ["whatsapp", 4096],
    ["zalo", 2000],
    ["instagram", 1000],
    ["threads", 500],
    ["webchat", 6000],
    ["tiktok", 6000],
    // Any channel is reachable, so the budget stays at what the channels it
    // realistically lands on accept.
    ["omnichannel", 1000],
  ])("text limit for %s is %i", (channel, expected) => {
    expect(resolveSendTextLengthLimits({ channel }).text).toBe(expected)
  })

  test("falls back to omnichannel for an unknown or missing channel", () => {
    expect(resolveSendTextLengthLimits({ channel: undefined }).text).toBe(1000)
    expect(resolveSendTextLengthLimits({ channel: null }).text).toBe(1000)
    expect(resolveSendTextLengthLimits({ channel: "myspace" }).text).toBe(1000)
  })

  test("tiktok drops to the card title limit once buttons are attached", () => {
    expect(
      resolveSendTextLengthLimits({ channel: "tiktok", hasButtons: true }).text,
    ).toBe(TIKTOK_CARD_TITLE_MAX)
    expect(
      resolveSendTextLengthLimits({ channel: "tiktok", hasButtons: false })
        .text,
    ).toBe(6000)
  })

  test("tiktok drops to the card title limit for quick replies alone", () => {
    // The node's quick replies build the same QA_BUTTON_CARD as the step's own
    // buttons, so a step with none of its own is still capped at the title.
    expect(
      resolveSendTextLengthLimits({
        channel: "tiktok",
        hasButtons: false,
        hasQuickReplies: true,
      }).text,
    ).toBe(TIKTOK_CARD_TITLE_MAX)
  })

  test("omnichannel keeps the full budget even with buttons", () => {
    // Mirrors refineTiktokSendTextStep, which blocks publish under the tiktok
    // key only — an omnichannel flow may never reach a TikTok contact.
    expect(
      resolveSendTextLengthLimits({ channel: "omnichannel", hasButtons: true })
        .text,
    ).toBe(1000)
    expect(
      resolveSendTextLengthLimits({
        channel: "omnichannel",
        hasQuickReplies: true,
      }).text,
    ).toBe(1000)
  })

  test("label limits match what buttonStepSchema enforces", () => {
    const limits = resolveSendTextLengthLimits({ channel: "messenger" })

    expect(limits.buttonLabel).toBe(BUTTON_LABEL_MAX)
    expect(limits.quickReplyLabel).toBe(BUTTON_LABEL_MAX)
  })
})

describe("sendTextStepSchema", () => {
  test("caps at the widest limit any channel accepts", () => {
    expect(SEND_TEXT_MAX).toBe(6000)
    expect(sendTextStepSchema.safeParse(step("a".repeat(6000))).success).toBe(
      true,
    )
    expect(sendTextStepSchema.safeParse(step("a".repeat(6001))).success).toBe(
      false,
    )
  })

  test("counts by code point, so an emoji is one character", () => {
    // 6000 emoji are 12000 UTF-16 units: `.max()` would have rejected this
    // while the editor's counter read 6000/6000.
    const result = sendTextStepSchema.safeParse(step("👋".repeat(6000)))

    expect(result.success).toBe(true)
    expect(sendTextStepSchema.safeParse(step("👋".repeat(6001))).success).toBe(
      false,
    )
  })

  test("raises a mapped code rather than a raw zod message", () => {
    const result = sendTextStepSchema.safeParse(step("a".repeat(6001)))

    expect(result.success).toBe(false)
    expect(issueCodes(result)).toContain(
      flowValidationCodes.sendTextTooLongForChannel,
    )
  })
})

describe("sendTextValidator length rules", () => {
  test.each([
    ["messenger", 2000],
    ["telegram", 4096],
    ["whatsapp", 4096],
    ["instagram", 1000],
    ["threads", 500],
    ["omnichannel", 1000],
  ])("%s accepts its limit and rejects one past it", (channel, max) => {
    expect(parseForChannel(channel, "a".repeat(max)).success).toBe(true)

    const overLimit = parseForChannel(channel, "a".repeat(max + 1))

    expect(overLimit.success).toBe(false)
    expect(issueCodes(overLimit)).toContain(
      flowValidationCodes.sendTextTooLongForChannel,
    )
  })

  test("every channel has a length rule of its own", () => {
    // A channel missing from the map would silently fall back to the
    // omnichannel base and be validated against the wrong limit.
    const telegramText = "a".repeat(4096)

    expect(parseForChannel("telegram", telegramText).success).toBe(true)
    expect(parseForChannel("omnichannel", telegramText).success).toBe(false)
  })

  test("a text over the schema ceiling is rejected on any channel", () => {
    expect(parseForChannel("telegram", "a".repeat(6001)).success).toBe(false)
  })

  test("a text over the schema ceiling raises the code once, not twice", () => {
    // The field cap and the channel rule share one code, so without a guard the
    // author would see the identical message twice at the same path.
    expect(issueCodes(parseForChannel("telegram", "a".repeat(6001)))).toEqual([
      flowValidationCodes.sendTextTooLongForChannel,
    ])
  })

  test("tiktok keeps its card title rule and raises it once, not twice", () => {
    const result = resolveStepValidator(sendTextValidator, "tiktok").safeParse(
      step("a".repeat(TIKTOK_CARD_TITLE_MAX + 1), [
        {
          beforeStep: null,
          buttonType: null,
          id: "2",
          label: "Yes",
          steps: [],
        },
      ]),
    )

    expect(result.success).toBe(false)
    expect(issueCodes(result)).toEqual([
      flowValidationCodes.tiktokCardTitleTooLong,
    ])
  })
})

describe("countMessageCharacters", () => {
  test("counts an emoji built from a surrogate pair as one character", () => {
    expect(countMessageCharacters("👋")).toBe(1)
    expect(countMessageCharacters("hi 👋")).toBe(4)
  })

  test("treats null and undefined as empty", () => {
    expect(countMessageCharacters(null)).toBe(0)
    expect(countMessageCharacters(undefined)).toBe(0)
  })
})
