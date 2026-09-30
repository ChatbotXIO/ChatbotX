import { channelTypes } from "@chatbotx.io/utils/channel"
import { describe, expect, test } from "vitest"
import { refineStepsByChannel } from "../src/channel-rules/channel-step-refinement"
import { resolveMediaStepSupport } from "../src/channel-rules/media-step-rules"
import { CHANNEL_FLOW_POLICIES } from "../src/channel-rules/policies"
import { resolveSendTextLengthLimits } from "../src/channel-rules/send-text-length-rules"
import {
  type SendMessageNodeSchema,
  sendMessageNodeDefaultFn,
} from "../src/nodes/send-message"
import { buttonStepDefaultFn } from "../src/steps/button"
import { chooseChannelStepDefaultFn } from "../src/steps/choose-channel"
import { sendCardStepDefaultFn } from "../src/steps/send-card"
import { sendTextStepDefaultFn } from "../src/steps/send-text"
import { stepTypes } from "../src/steps/step-action"

const MEDIA_SUPPORT_BY_CHANNEL = {
  api: ["noButtons", "noButtons", "noButtons", "noButtons", "full"],
  instagram: ["noButtons", "noButtons", "noButtons", "noButtons", "full"],
  messenger: ["full", "full", "noButtons", "noButtons", "full"],
  omnichannel: ["full", "full", "full", "full", "full"],
  smtp: ["full", "full", "full", "full", "full"],
  telegram: ["full", "full", "full", "full", "full"],
  threads: [
    "unsupported",
    "unsupported",
    "unsupported",
    "unsupported",
    "unsupported",
  ],
  tiktok: [
    "noButtons",
    "unsupported",
    "unsupported",
    "unsupported",
    "unsupported",
  ],
  webchat: ["full", "full", "full", "full", "full"],
  whatsapp: [
    "full",
    "unsupported",
    "unsupported",
    "unsupported",
    "unsupported",
  ],
  zalo: ["full", "unsupported", "unsupported", "noButtons", "full"],
} as const

const MEDIA_STEP_TYPES = [
  stepTypes.enum.sendImage,
  stepTypes.enum.sendVideo,
  stepTypes.enum.sendAudio,
  stepTypes.enum.sendFile,
  stepTypes.enum.sendGif,
] as const

const TEXT_LIMITS = {
  api: 6000,
  instagram: 1000,
  messenger: 2000,
  omnichannel: 1000,
  smtp: 6000,
  telegram: 4096,
  threads: 500,
  tiktok: 6000,
  webchat: 6000,
  whatsapp: 4096,
  zalo: 2000,
} as const

const collectIssues = (node: SendMessageNodeSchema) => {
  const issues: { message: string; path: PropertyKey[] }[] = []

  refineStepsByChannel([node], {
    addIssue: (issue: { message: string; path: PropertyKey[] }) =>
      issues.push(issue),
  } as never)

  return issues
}

describe("channel flow policies", () => {
  test("defines a complete policy for every channel and step type", () => {
    expect(Object.keys(CHANNEL_FLOW_POLICIES).sort()).toEqual(
      [...channelTypes.options].sort(),
    )

    for (const policy of Object.values(CHANNEL_FLOW_POLICIES)) {
      expect(Object.keys(policy.steps).sort()).toEqual(
        [...stepTypes.options].sort(),
      )
    }
  })

  test("preserves media support for every channel and media step", () => {
    for (const channel of channelTypes.options) {
      const expected = MEDIA_SUPPORT_BY_CHANNEL[channel]

      for (const [index, stepType] of MEDIA_STEP_TYPES.entries()) {
        expect(resolveMediaStepSupport({ channel, stepType })).toBe(
          expected[index],
        )
      }
    }
  })

  test("preserves text limits", () => {
    for (const channel of channelTypes.options) {
      expect(resolveSendTextLengthLimits({ channel }).text).toBe(
        TEXT_LIMITS[channel],
      )
    }
  })

  test("keeps TikTok's three-button and 40-character card title limits", () => {
    expect(CHANNEL_FLOW_POLICIES.tiktok.limits.buttonCount).toBe(3)
    expect(CHANNEL_FLOW_POLICIES.tiktok.limits.cardTitle).toBe(40)
  })

  test("blocks unsupported steps on every channel policy", () => {
    const node = sendMessageNodeDefaultFn({
      nodeProps: {},
      detailProps: {
        beforeStep: chooseChannelStepDefaultFn({ channel: "instagram" }),
        quickReplies: [],
        steps: [sendCardStepDefaultFn()],
      },
    })

    expect(collectIssues(node)).toContainEqual(
      expect.objectContaining({
        message: "unsupportedBlock",
        path: [0, "data", "details", "steps", 0],
      }),
    )
  })

  test("allows three TikTok buttons and rejects a fourth", () => {
    const makeNode = (buttonCount: number) =>
      sendMessageNodeDefaultFn({
        nodeProps: {},
        detailProps: {
          beforeStep: chooseChannelStepDefaultFn({ channel: "tiktok" }),
          quickReplies: [],
          steps: [
            sendTextStepDefaultFn({
              text: "Choose one",
              buttons: Array.from({ length: buttonCount }, () =>
                buttonStepDefaultFn({ label: "Option" }),
              ),
            }),
          ],
        },
      })

    expect(collectIssues(makeNode(3))).toEqual([])
    expect(collectIssues(makeNode(4))).toContainEqual(
      expect.objectContaining({
        message: "constraintExceeded",
        path: [0, "data", "details", "steps", 0, "buttons"],
      }),
    )
  })

  test("allows ten quick replies for Messenger and omnichannel text steps", () => {
    const makeNode = (channel: "messenger" | "omnichannel") =>
      sendMessageNodeDefaultFn({
        nodeProps: {},
        detailProps: {
          beforeStep: chooseChannelStepDefaultFn({ channel }),
          quickReplies: Array.from({ length: 10 }, () =>
            buttonStepDefaultFn({ label: "Option" }),
          ),
          steps: [sendTextStepDefaultFn({ text: "Choose one" })],
        },
      })

    expect(collectIssues(makeNode("messenger"))).toEqual([])
    expect(collectIssues(makeNode("omnichannel"))).toEqual([])
  })

  test("counts TikTok quick replies with text-step buttons", () => {
    const node = sendMessageNodeDefaultFn({
      nodeProps: {},
      detailProps: {
        beforeStep: chooseChannelStepDefaultFn({ channel: "tiktok" }),
        quickReplies: Array.from({ length: 2 }, () =>
          buttonStepDefaultFn({ label: "Option" }),
        ),
        steps: [
          sendTextStepDefaultFn({
            text: "Choose one",
            buttons: Array.from({ length: 2 }, () =>
              buttonStepDefaultFn({ label: "Option" }),
            ),
          }),
        ],
      },
    })

    expect(collectIssues(node)).toContainEqual(
      expect.objectContaining({
        message: "constraintExceeded",
        path: [0, "data", "details", "quickReplies"],
      }),
    )
  })

  test("uses omnichannel policy for legacy channel values", () => {
    const node = sendMessageNodeDefaultFn({
      nodeProps: {},
      detailProps: {
        beforeStep: chooseChannelStepDefaultFn({ channel: "legacy-channel" }),
        quickReplies: [],
        steps: [sendCardStepDefaultFn()],
      },
    })

    expect(collectIssues(node)).toEqual([])
  })
})
