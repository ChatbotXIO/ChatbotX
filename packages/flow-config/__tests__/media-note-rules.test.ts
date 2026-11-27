import { channelTypes } from "@chatbotx.io/utils/channel"
import { describe, expect, test } from "vitest"
import { canSendMediaNote } from "../src/channel-rules/media-note-rules"
import {
  sendAudioValidator,
  sendVideoValidator,
} from "../src/channel-rules/media-step-validators"
import { flowValidationCodes } from "../src/validation-codes"

const step = (stepType: string, extra: Record<string, unknown> = {}) => ({
  id: "1",
  stepType,
  mode: "file" as const,
  url: "https://example.com/a.bin",
  buttons: [],
  ...extra,
})

describe("canSendMediaNote", () => {
  test("Telegram sends audio and video as notes", () => {
    expect(canSendMediaNote(channelTypes.enum.telegram, "sendAudio")).toBe(true)
    expect(canSendMediaNote(channelTypes.enum.telegram, "sendVideo")).toBe(true)
  })

  test("no other step, channel or unknown channel does", () => {
    expect(canSendMediaNote(channelTypes.enum.telegram, "sendImage")).toBe(
      false,
    )
    expect(canSendMediaNote(channelTypes.enum.messenger, "sendAudio")).toBe(
      false,
    )
    expect(canSendMediaNote(channelTypes.enum.omnichannel, "sendVideo")).toBe(
      false,
    )
    expect(canSendMediaNote(null, "sendAudio")).toBe(false)
  })
})

describe("media note validators", () => {
  test("accept a note where the channel sends one", () => {
    for (const [validator, stepType] of [
      [sendAudioValidator, "sendAudio"],
      [sendVideoValidator, "sendVideo"],
    ] as const) {
      expect(
        validator.telegram?.safeParse(step(stepType, { asNote: true })).success,
      ).toBe(true)
    }
  })

  test("reject a note where the channel sends none, naming the field", () => {
    for (const channel of [
      channelTypes.enum.omnichannel,
      channelTypes.enum.whatsapp,
    ]) {
      const result = sendAudioValidator[channel]?.safeParse(
        step("sendAudio", { asNote: true }),
      )
      expect(result?.success).toBe(false)
      expect(result?.error?.issues[0]?.message).toBe(
        flowValidationCodes.mediaNoteUnsupported,
      )
      expect(result?.error?.issues[0]?.path).toEqual(["asNote"])
    }
  })

  test("a round video takes no caption", () => {
    const result = sendVideoValidator.telegram?.safeParse(
      step("sendVideo", { asNote: true, caption: "Hi" }),
    )
    expect(result?.success).toBe(false)
    expect(result?.error?.issues[0]?.message).toBe(
      flowValidationCodes.mediaNoteCaptionUnsupported,
    )
    expect(result?.error?.issues[0]?.path).toEqual(["caption"])
  })

  test("asNote false or unset passes everywhere", () => {
    for (const channel of channelTypes.options) {
      expect(
        sendAudioValidator[channel]?.safeParse(
          step("sendAudio", { asNote: false }),
        ).success,
      ).toBe(true)
    }
  })
})
