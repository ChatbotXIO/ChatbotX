import { channelTypes } from "@chatbotx.io/utils/channel"
import { describe, expect, test } from "vitest"
import {
  MEDIA_CAPTION_MAX,
  resolveMediaCaptionLimit,
} from "../src/channel-rules/media-caption-rules"
import {
  sendImageValidator,
  sendVideoValidator,
} from "../src/channel-rules/media-step-validators"
import { CHANNEL_FLOW_POLICIES } from "../src/channel-rules/policies"
import { sendCardStepSchema } from "../src/steps/send-card"
import { sendImageStepSchema } from "../src/steps/send-image"
import { flowValidationCodes } from "../src/validation-codes"

const step = (stepType: string, caption?: string) => ({
  id: "1",
  stepType,
  mode: "file" as const,
  url: "https://example.com/a.bin",
  buttons: [],
  ...(caption === undefined ? {} : { caption }),
})

describe("media caption limit", () => {
  test("Telegram sends a caption of up to 1,024 characters", () => {
    expect(CHANNEL_FLOW_POLICIES.telegram.limits.mediaCaption).toBe(1024)
    expect(resolveMediaCaptionLimit(channelTypes.enum.telegram)).toBe(1024)
  })

  test("a channel without the limit, or no channel, sends no caption", () => {
    expect(
      resolveMediaCaptionLimit(channelTypes.enum.messenger),
    ).toBeUndefined()
    expect(
      resolveMediaCaptionLimit(channelTypes.enum.omnichannel),
    ).toBeUndefined()
    expect(resolveMediaCaptionLimit("nope")).toBeUndefined()
    expect(resolveMediaCaptionLimit(null)).toBeUndefined()
  })

  test("the schema caps at the widest declared limit", () => {
    expect(MEDIA_CAPTION_MAX).toBe(1024)
    const result = sendImageStepSchema.safeParse(
      step("sendImage", "a".repeat(1025)),
    )
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      flowValidationCodes.mediaCaptionTooLong,
    )
  })

  test("a card image has no caption of its own", () => {
    expect("caption" in sendCardStepSchema.shape.image.unwrap().shape).toBe(
      false,
    )
  })
})

describe("media caption validators", () => {
  test("accept a caption where the channel sends one", () => {
    for (const [validator, stepType] of [
      [sendImageValidator, "sendImage"],
      [sendVideoValidator, "sendVideo"],
    ] as const) {
      expect(
        validator.telegram?.safeParse(step(stepType, "Hi {{first_name}}"))
          .success,
      ).toBe(true)
    }
  })

  test("reject a caption where the channel sends none, naming the field", () => {
    for (const channel of [
      channelTypes.enum.omnichannel,
      channelTypes.enum.messenger,
    ]) {
      const result = sendImageValidator[channel]?.safeParse(
        step("sendImage", "Hi"),
      )
      expect(result?.success).toBe(false)
      expect(result?.error?.issues[0]?.message).toBe(
        flowValidationCodes.mediaCaptionUnsupported,
      )
      expect(result?.error?.issues[0]?.path).toEqual(["caption"])
    }
  })

  test("an empty or missing caption passes on every channel", () => {
    for (const channel of channelTypes.options) {
      expect(
        sendVideoValidator[channel]?.safeParse(step("sendVideo", "")).success,
      ).toBe(true)
      expect(
        sendVideoValidator[channel]?.safeParse(step("sendVideo")).success,
      ).toBe(true)
    }
  })
})
