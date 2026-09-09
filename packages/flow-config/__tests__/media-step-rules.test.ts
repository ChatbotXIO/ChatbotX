import { describe, expect, test } from "vitest"
import {
  isMediaButtonsDropped,
  isMediaStepUnsupported,
  resolveMediaStepSupport,
} from "../src/channel-rules/media-step-rules"
import {
  sendAudioValidator,
  sendFileValidator,
  sendGifValidator,
  sendImageValidator,
  sendVideoValidator,
} from "../src/channel-rules/media-step-validators"
import { channelAwareStepValidators } from "../src/channel-rules/validators"
import { buttonStepDefaultFn } from "../src/steps/button"
import { stepTypes } from "../src/steps/step-action"
import { flowValidationCodes } from "../src/validation-codes"

const buttons = [buttonStepDefaultFn({ label: "Yes" })]

const step = (stepType: string, extra: Record<string, unknown> = {}) => ({
  id: "1",
  stepType,
  mode: "file" as const,
  url: "https://example.com/a.bin",
  buttons,
  ...extra,
})

// The table these assertions pin was read off each integration's sendFlowStep
// switch — see the comment on MEDIA_STEP_SUPPORT.
describe("resolveMediaStepSupport", () => {
  test.each([
    ["telegram", "sendVideo", "full"],
    ["telegram", "sendFile", "full"],
    ["messenger", "sendImage", "full"],
    ["messenger", "sendVideo", "full"],
    ["messenger", "sendAudio", "noButtons"],
    ["messenger", "sendFile", "noButtons"],
    ["instagram", "sendImage", "noButtons"],
    ["instagram", "sendVideo", "noButtons"],
    ["whatsapp", "sendImage", "full"],
    ["whatsapp", "sendVideo", "unsupported"],
    ["whatsapp", "sendAudio", "unsupported"],
    ["whatsapp", "sendFile", "unsupported"],
    ["whatsapp", "sendGif", "unsupported"],
    ["zalo", "sendImage", "full"],
    ["zalo", "sendVideo", "unsupported"],
    ["zalo", "sendAudio", "unsupported"],
    ["zalo", "sendFile", "noButtons"],
    ["zalo", "sendGif", "full"],
    ["tiktok", "sendImage", "noButtons"],
    ["tiktok", "sendVideo", "unsupported"],
    ["tiktok", "sendGif", "unsupported"],
    ["api", "sendImage", "noButtons"],
    ["webchat", "sendVideo", "full"],
    ["omnichannel", "sendVideo", "full"],
  ])("%s / %s → %s", (channel, stepType, expected) => {
    expect(resolveMediaStepSupport({ channel, stepType })).toBe(expected)
  })

  test("an unknown or empty channel falls back to full, like resolveStepValidator", () => {
    expect(
      resolveMediaStepSupport({ channel: "", stepType: "sendVideo" }),
    ).toBe("full")
    expect(
      resolveMediaStepSupport({ channel: "nope", stepType: "sendVideo" }),
    ).toBe("full")
  })

  test("a non-media step is never constrained here", () => {
    expect(
      resolveMediaStepSupport({ channel: "whatsapp", stepType: "sendText" }),
    ).toBe("full")
  })
})

describe("isMediaButtonsDropped", () => {
  test("true only once buttons are actually attached", () => {
    expect(
      isMediaButtonsDropped({
        channel: "instagram",
        stepType: "sendImage",
        buttons,
      }),
    ).toBe(true)
    expect(
      isMediaButtonsDropped({
        channel: "instagram",
        stepType: "sendImage",
        buttons: [],
      }),
    ).toBe(false)
  })

  // The step is not sent at all there, so the buttons are not the story.
  test("false on a channel where the whole step is unsupported", () => {
    expect(
      isMediaButtonsDropped({
        channel: "whatsapp",
        stepType: "sendVideo",
        buttons,
      }),
    ).toBe(false)
  })
})

describe("isMediaStepUnsupported", () => {
  test("true where the channel has no branch for the step", () => {
    expect(
      isMediaStepUnsupported({ channel: "tiktok", stepType: "sendFile" }),
    ).toBe(true)
  })

  test("false where the media is sent, buttons or not", () => {
    expect(
      isMediaStepUnsupported({ channel: "tiktok", stepType: "sendImage" }),
    ).toBe(false)
  })
})

describe("media step validators block publish per channel", () => {
  test("omnichannel — the node default — is never blocked", () => {
    for (const [validator, stepType] of [
      [sendImageValidator, "sendImage"],
      [sendVideoValidator, "sendVideo"],
      [sendAudioValidator, "sendAudio"],
      [sendFileValidator, "sendFile"],
    ] as const) {
      expect(validator.omnichannel.safeParse(step(stepType)).success).toBe(true)
    }
    expect(
      sendGifValidator.omnichannel.safeParse({
        id: "1",
        stepType: "sendGif",
        url: "https://example.com/a.gif",
      }).success,
    ).toBe(true)
  })

  test("rejects buttons on a channel that drops them, naming the buttons field", () => {
    const result = sendImageValidator.instagram?.safeParse(step("sendImage"))

    expect(result?.success).toBe(false)
    expect(result?.error?.issues[0]?.message).toBe(
      flowValidationCodes.mediaButtonsUnsupported,
    )
    expect(result?.error?.issues[0]?.path).toEqual(["buttons"])
  })

  test("rejects a step the channel cannot send at all, naming the url field", () => {
    const result = sendVideoValidator.whatsapp?.safeParse(step("sendVideo"))

    expect(result?.success).toBe(false)
    expect(result?.error?.issues[0]?.message).toBe(
      flowValidationCodes.mediaStepUnsupported,
    )
    expect(result?.error?.issues[0]?.path).toEqual(["url"])
  })

  test("an unsupported step is rejected even with no buttons attached", () => {
    expect(
      sendFileValidator.tiktok?.safeParse(step("sendFile", { buttons: [] }))
        .success,
    ).toBe(false)
  })

  test("a supported step with no buttons publishes on a dropping channel", () => {
    expect(
      sendImageValidator.instagram?.safeParse(
        step("sendImage", { buttons: [] }),
      ).success,
    ).toBe(true)
  })

  // A gif step carries no buttons, so only the unsupported mode can fire.
  test("gif is blocked on whatsapp and tiktok, allowed on zalo", () => {
    const gif = { id: "1", stepType: "sendGif", url: "https://x.dev/a.gif" }

    expect(sendGifValidator.whatsapp?.safeParse(gif).success).toBe(false)
    expect(sendGifValidator.tiktok?.safeParse(gif).success).toBe(false)
    expect(sendGifValidator.zalo).toBeUndefined()
  })

  test("a channel with nothing to say gets no override at all", () => {
    // Telegram sends every media step in full, buttons included.
    for (const validator of [
      sendImageValidator,
      sendVideoValidator,
      sendAudioValidator,
      sendFileValidator,
      sendGifValidator,
    ]) {
      expect(validator.telegram).toBeUndefined()
    }
  })

  test("every media step type is registered in channelAwareStepValidators", () => {
    for (const stepType of [
      stepTypes.enum.sendImage,
      stepTypes.enum.sendVideo,
      stepTypes.enum.sendAudio,
      stepTypes.enum.sendFile,
      stepTypes.enum.sendGif,
    ]) {
      expect(channelAwareStepValidators[stepType]).toBeDefined()
    }
  })
})
