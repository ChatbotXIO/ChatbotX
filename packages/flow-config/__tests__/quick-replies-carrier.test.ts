import { describe, expect, test } from "vitest"
import {
  BUTTON_LABEL_MAX,
  buttonStepDefaultFn,
  buttonStepSchema,
  chooseChannelStepDefaultFn,
  isQuickReplyCarrierStep,
  MAX_QUICK_REPLIES,
  sendAudioStepDefaultFn,
  sendFileStepDefaultFn,
  sendGifStepDefaultFn,
  sendImageStepDefaultFn,
  sendMessageNodeDefaultFn,
  sendMessageNodeSchema,
  sendQuickReplyStepDefaultFn,
  sendTextStepDefaultFn,
  sendVideoStepDefaultFn,
} from "../src"

describe("sendMessage quick replies", () => {
  const quickReplies = [buttonStepDefaultFn({ label: "Yes" })]
  const imageStep = {
    ...sendImageStepDefaultFn(),
    url: "https://example.com/image.png",
  }

  test.each([
    "omnichannel",
    "telegram",
    "whatsapp",
    "zalo",
    "messenger",
    "instagram",
    "tiktok",
  ])("accepts an image-only node with quick replies for %s (builder does not gate on carrier eligibility)", (channel) => {
    const node = sendMessageNodeDefaultFn({
      nodeProps: {},
      detailProps: {
        beforeStep: chooseChannelStepDefaultFn({ channel }),
        steps: [imageStep],
        quickReplies,
      },
    })

    const result = sendMessageNodeSchema.safeParse(node)

    expect(result.success).toBe(true)
  })

  test("returns carrier eligibility by channel (used by the worker to decide whether a step actually receives quick replies)", () => {
    const textStep = sendTextStepDefaultFn({ text: "Choose" })
    const textWithButtonsStep = sendTextStepDefaultFn({
      text: "Choose",
      buttons: [buttonStepDefaultFn({ label: "Existing" })],
    })
    const videoStep = {
      ...sendVideoStepDefaultFn(),
      url: "https://example.com/video.mp4",
    }
    const audioStep = sendAudioStepDefaultFn({
      url: "https://example.com/audio.mp3",
    })
    const fileStep = {
      ...sendFileStepDefaultFn(),
      url: "https://example.com/file.pdf",
    }
    const gifStep = {
      ...sendGifStepDefaultFn(),
      url: "https://example.com/anim.gif",
    }

    expect(isQuickReplyCarrierStep("telegram", textStep)).toBe(true)
    expect(isQuickReplyCarrierStep("telegram", imageStep)).toBe(true)
    expect(isQuickReplyCarrierStep("telegram", videoStep)).toBe(true)
    expect(isQuickReplyCarrierStep("telegram", audioStep)).toBe(true)
    expect(isQuickReplyCarrierStep("telegram", fileStep)).toBe(true)
    expect(isQuickReplyCarrierStep("telegram", gifStep)).toBe(true)

    expect(isQuickReplyCarrierStep("whatsapp", imageStep)).toBe(true)
    expect(isQuickReplyCarrierStep("zalo", imageStep)).toBe(true)
    expect(isQuickReplyCarrierStep("messenger", imageStep)).toBe(true)
    expect(isQuickReplyCarrierStep("instagram", imageStep)).toBe(true)
    expect(isQuickReplyCarrierStep("tiktok", imageStep)).toBe(false)
    expect(isQuickReplyCarrierStep("messenger", textStep)).toBe(true)
    expect(isQuickReplyCarrierStep("messenger", textWithButtonsStep)).toBe(true)
  })

  test("enforces quick reply label and count limits", () => {
    expect(
      buttonStepSchema.safeParse(
        buttonStepDefaultFn({ label: "a".repeat(BUTTON_LABEL_MAX) }),
      ).success,
    ).toBe(true)
    expect(
      buttonStepSchema.safeParse(
        buttonStepDefaultFn({ label: "a".repeat(BUTTON_LABEL_MAX + 1) }),
      ).success,
    ).toBe(false)

    const node = sendMessageNodeDefaultFn({
      nodeProps: {},
      detailProps: {
        steps: [sendTextStepDefaultFn({ text: "Choose one" })],
        quickReplies: Array.from({ length: MAX_QUICK_REPLIES + 1 }, (_, i) =>
          buttonStepDefaultFn({ label: `Reply ${i}` }),
        ),
      },
    })

    const result = sendMessageNodeSchema.safeParse(node)

    expect(result.success).toBe(false)
  })

  test("does not default legacy sendQuickReply steps to a hardcoded prompt", () => {
    const step = sendQuickReplyStepDefaultFn()

    expect(step.message).not.toBe("Please select an option")
    expect(step.message).toBe("")
  })
})
