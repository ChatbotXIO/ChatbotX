import { describe, expect, test } from "vitest"
import { sendTextValidator } from "../src/channel-rules/send-text-validator"
import {
  isTiktokCardTitleTruncated,
  TIKTOK_CARD_TITLE_MAX,
} from "../src/channel-rules/tiktok-text-rules"
import { buttonStepDefaultFn } from "../src/steps/button"
import { sendTextStepSchema } from "../src/steps/send-text"
import { flowValidationCodes } from "../src/validation-codes"

const button = (label = "Yes") => buttonStepDefaultFn({ label })

describe("isTiktokCardTitleTruncated", () => {
  test("true once buttons are attached and the text exceeds the limit", () => {
    expect(
      isTiktokCardTitleTruncated({
        channel: "tiktok",
        buttons: [button()],
        text: "x".repeat(TIKTOK_CARD_TITLE_MAX + 1),
      }),
    ).toBe(true)
  })

  test("false when the text fits within the limit", () => {
    expect(
      isTiktokCardTitleTruncated({
        channel: "tiktok",
        buttons: [button()],
        text: "x".repeat(TIKTOK_CARD_TITLE_MAX),
      }),
    ).toBe(false)
  })

  test("false when no buttons are attached", () => {
    expect(
      isTiktokCardTitleTruncated({
        channel: "tiktok",
        buttons: [],
        text: "x".repeat(TIKTOK_CARD_TITLE_MAX + 1),
      }),
    ).toBe(false)
  })

  test("true on omnichannel too, since it may still reach a tiktok contact", () => {
    expect(
      isTiktokCardTitleTruncated({
        channel: "omnichannel",
        buttons: [button()],
        text: "x".repeat(TIKTOK_CARD_TITLE_MAX + 1),
      }),
    ).toBe(true)
  })

  test("false on a channel that can never reach tiktok", () => {
    expect(
      isTiktokCardTitleTruncated({
        channel: "messenger",
        buttons: [button()],
        text: "x".repeat(TIKTOK_CARD_TITLE_MAX + 1),
      }),
    ).toBe(false)
  })
})

describe("sendTextValidator", () => {
  const step = {
    id: "1",
    stepType: "sendText" as const,
    text: "x".repeat(TIKTOK_CARD_TITLE_MAX + 1),
    buttons: [button()],
  }

  test("rejects a tiktok sendText step whose text is too long once buttoned", () => {
    const result = sendTextValidator.tiktok.safeParse(step)

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      flowValidationCodes.tiktokCardTitleTooLong,
    )
  })

  test("accepts the same step on omnichannel, which may never reach tiktok", () => {
    const result = sendTextValidator.omnichannel.safeParse(step)

    expect(result.success).toBe(true)
  })

  test("accepts a tiktok sendText step whose text fits once buttoned", () => {
    const result = sendTextValidator.tiktok.safeParse({
      ...step,
      text: "Choose one",
    })

    expect(result.success).toBe(true)
  })

  test("stays a plain sendTextStepSchema shape for tiktok when no buttons are attached", () => {
    const result = sendTextValidator.tiktok.safeParse({
      ...step,
      buttons: [],
    })

    expect(result.success).toBe(true)
  })
})

describe("sendTextStepSchema", () => {
  test("sendTextValidator.omnichannel is the unrefined base schema", () => {
    expect(sendTextValidator.omnichannel).toBe(sendTextStepSchema)
  })
})
