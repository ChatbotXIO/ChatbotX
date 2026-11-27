import { channelTypes } from "@chatbotx.io/utils/channel"
import { describe, expect, test } from "vitest"
import { z } from "zod"
import { refineStepsByChannel } from "../src/channel-rules/channel-step-refinement"
import {
  buttonContainers,
  CHANNEL_FLOW_POLICIES,
  getButtonCountLimit,
} from "../src/channel-rules/policies"
import { flowVersionSchema } from "../src/nodes/index"
import {
  type SendMessageNodeSchema,
  sendMessageNodeDefaultFn,
} from "../src/nodes/send-message"
import {
  buttonStepDefaultFn,
  buttonStepSchema,
  buttonStyles,
  CARD_BUTTON_MAX,
} from "../src/steps/button"
import { chooseChannelStepDefaultFn } from "../src/steps/choose-channel"
import {
  sendCardStepDefaultFn,
  sendCardStepSchema,
} from "../src/steps/send-card"
import { sendCarouselStepDefaultFn } from "../src/steps/send-carousel"
import { sendTextStepDefaultFn } from "../src/steps/send-text"

const buttons = (count: number) =>
  Array.from({ length: count }, () => buttonStepDefaultFn({ label: "Option" }))

const card = (count: number) => ({
  ...sendCardStepDefaultFn(),
  title: "Card",
  image: undefined,
  buttons: buttons(count),
})

const node = (
  channel: string,
  steps: SendMessageNodeSchema["data"]["details"]["steps"],
) =>
  sendMessageNodeDefaultFn({
    nodeProps: {},
    detailProps: {
      beforeStep: chooseChannelStepDefaultFn({ channel }),
      quickReplies: [],
      steps,
    },
  })

const collectIssues = (value: SendMessageNodeSchema) => {
  const issues: { message: string; path: PropertyKey[] }[] = []
  refineStepsByChannel([value], {
    addIssue: (issue: { message: string; path: PropertyKey[] }) =>
      issues.push(issue),
  } as never)
  return issues
}

/** Step / card button limits every channel had before LINE's 5; LINE is the only change. */
const EXPECTED_LIMITS = {
  api: [3, 3],
  instagram: [3, 3],
  line: [5, 5],
  messenger: [3, 3],
  omnichannel: [3, 3],
  smtp: [3, 3],
  telegram: [10, 3],
  threads: [3, 3],
  tiktok: [3, 3],
  webchat: [3, 3],
  whatsapp: [3, 3],
  zalo: [3, 3],
} as const

describe("button limits", () => {
  test("CARD_BUTTON_MAX is exactly the largest card limit of any channel policy", () => {
    const largest = Math.max(
      ...Object.values(CHANNEL_FLOW_POLICIES).map(
        (policy) => policy.limits.cardButtonCount,
      ),
    )
    expect(
      CARD_BUTTON_MAX,
      "A channel policy's limits.cardButtonCount and CARD_BUTTON_MAX (steps/button-limits.ts) disagree: the card schema caps buttons at CARD_BUTTON_MAX, so raise (or lower) it to the largest cardButtonCount.",
    ).toBe(largest)
  })

  test("keeps every channel's step and card button limits", () => {
    for (const channel of channelTypes.options) {
      const policy = CHANNEL_FLOW_POLICIES[channel]
      expect([
        getButtonCountLimit(policy, buttonContainers.step),
        getButtonCountLimit(policy, buttonContainers.card),
      ]).toEqual(EXPECTED_LIMITS[channel])
    }
  })

  test("Telegram keeps 10 buttons on a text step", () => {
    expect(
      collectIssues(
        node("telegram", [
          sendTextStepDefaultFn({ text: "Hi", buttons: buttons(10) }),
        ]),
      ),
    ).toEqual([])
    expect(
      collectIssues(
        node("telegram", [
          sendTextStepDefaultFn({ text: "Hi", buttons: buttons(11) }),
        ]),
      ),
    ).toContainEqual(
      expect.objectContaining({
        message: "sendText exceeds the telegram maximum of 10 buttons.",
      }),
    )
  })

  test("Telegram carousel cards keep the 3-button card limit", () => {
    const issues = collectIssues(
      node("telegram", [
        { ...sendCarouselStepDefaultFn(), cards: [card(3), card(4)] },
      ]),
    )
    expect(issues).toContainEqual(
      expect.objectContaining({
        message: "sendCarousel exceeds the telegram maximum of 3 buttons.",
        path: [0, "data", "details", "steps", 0, "cards", 1, "buttons"],
      }),
    )
    expect(issues).toHaveLength(1)
  })

  test("Messenger rejects a fourth button on a card and on a carousel card", () => {
    expect(collectIssues(node("messenger", [card(3)]))).toEqual([])
    expect(collectIssues(node("messenger", [card(4)]))).toContainEqual(
      expect.objectContaining({
        message: "sendCard exceeds the messenger maximum of 3 buttons.",
      }),
    )
    expect(
      collectIssues(
        node("messenger", [
          { ...sendCarouselStepDefaultFn(), cards: [card(4)] },
        ]),
      ),
    ).toContainEqual(
      expect.objectContaining({
        message: "sendCarousel exceeds the messenger maximum of 3 buttons.",
        path: [0, "data", "details", "steps", 0, "cards", 0, "buttons"],
      }),
    )
  })

  test("omnichannel rejects a fourth carousel-card button", () => {
    expect(
      collectIssues(
        node("omnichannel", [
          { ...sendCarouselStepDefaultFn(), cards: [card(4)] },
        ]),
      ),
    ).toContainEqual(
      expect.objectContaining({
        message: "sendCarousel exceeds the omnichannel maximum of 3 buttons.",
      }),
    )
  })

  test("the card schema allows CARD_BUTTON_MAX buttons, not more", () => {
    expect(sendCardStepSchema.safeParse(card(CARD_BUTTON_MAX)).success).toBe(
      true,
    )
    expect(
      sendCardStepSchema.safeParse(card(CARD_BUTTON_MAX + 1)).success,
    ).toBe(false)
  })
})

describe("button style", () => {
  test("the schema accepts the three styles and no style, and rejects others", () => {
    for (const style of buttonStyles.options) {
      expect(
        buttonStepSchema.safeParse({
          ...buttonStepDefaultFn({ label: "Go" }),
          style,
        }).success,
      ).toBe(true)
    }
    const unstyled = buttonStepSchema.safeParse(
      buttonStepDefaultFn({ label: "Go" }),
    )
    expect(unstyled.success).toBe(true)
    expect(unstyled.data).not.toHaveProperty("style")
    expect(
      buttonStepSchema.safeParse({
        ...buttonStepDefaultFn({ label: "Go" }),
        style: "danger",
      }).success,
    ).toBe(false)
  })

  test("only LINE declares button styles", () => {
    for (const channel of channelTypes.options) {
      expect(CHANNEL_FLOW_POLICIES[channel].buttonStyles !== null).toBe(
        channel === channelTypes.enum.line,
      )
    }
  })

  test("a channel's default style is one it renders", () => {
    for (const policy of Object.values(CHANNEL_FLOW_POLICIES)) {
      if (policy.buttonStyles) {
        expect(policy.buttonStyles.options).toContain(
          policy.buttonStyles.default,
        )
      }
    }
  })

  test("a styled button on a non-LINE node still publishes", () => {
    const styled = {
      ...buttonStepDefaultFn({ label: "Go" }),
      style: "primary" as const,
    }
    for (const channel of ["messenger", "omnichannel", "telegram"]) {
      const result = z
        .array(flowVersionSchema)
        .superRefine(refineStepsByChannel)
        .safeParse([
          node(channel, [
            sendTextStepDefaultFn({ text: "Hi", buttons: [styled] }),
          ]),
        ])
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true)
    }
  })
})
