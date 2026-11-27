import { describe, expect, test } from "vitest"
import { z } from "zod"
import { refineStepsByChannel } from "../src/channel-rules/channel-step-refinement"
import {
  CHANNEL_FLOW_POLICIES,
  CHANNEL_POLICY_VERSION,
} from "../src/channel-rules/policies"
import { resolveSendTextLengthLimits } from "../src/channel-rules/send-text-length-rules"
import { flowVersionSchema } from "../src/nodes/index"
import {
  type SendMessageNodeSchema,
  sendMessageNodeDefaultFn,
} from "../src/nodes/send-message"
import { buttonStepDefaultFn, buttonTypes } from "../src/steps/button"
import { chooseChannelStepDefaultFn } from "../src/steps/choose-channel"
import { sendCardStepDefaultFn } from "../src/steps/send-card"
import { sendCarouselStepDefaultFn } from "../src/steps/send-carousel"
import { sendImageStepDefaultFn } from "../src/steps/send-image"
import { sendTextStepDefaultFn } from "../src/steps/send-text"
import { stepTypes } from "../src/steps/step-action"

const collectIssues = (node: SendMessageNodeSchema) => {
  const issues: { message: string; path: PropertyKey[] }[] = []
  refineStepsByChannel([node], {
    addIssue: (issue: { message: string; path: PropertyKey[] }) =>
      issues.push(issue),
  } as never)
  return issues
}

const lineNode = (steps: SendMessageNodeSchema["data"]["details"]["steps"]) =>
  sendMessageNodeDefaultFn({
    nodeProps: {},
    detailProps: {
      beforeStep: chooseChannelStepDefaultFn({ channel: "line" }),
      quickReplies: [],
      steps,
    },
  })

const buttons = (count: number) =>
  Array.from({ length: count }, () => buttonStepDefaultFn({ label: "Option" }))

const card = (count: number) => ({
  ...sendCardStepDefaultFn(),
  title: "Card",
  image: undefined,
  buttons: buttons(count),
})

describe("LINE flow policy", () => {
  test("declares the LINE limits", () => {
    expect(CHANNEL_FLOW_POLICIES.line.limits).toEqual({
      buttonCount: 5,
      cardButtonCount: 5,
      buttonLabel: 20,
      text: 5000,
    })
  })

  test("treats callPhoneNumber as a native button (sent as a tel: URI)", () => {
    expect(CHANNEL_FLOW_POLICIES.line.nativeButtonTypes).toEqual([
      buttonTypes.enum.callPhoneNumber,
    ])
  })

  test("keeps the 5000 text limit with quick replies or buttons", () => {
    expect(
      resolveSendTextLengthLimits({ channel: "line", hasQuickReplies: true })
        .text,
    ).toBe(5000)
    expect(
      resolveSendTextLengthLimits({ channel: "line", hasButtons: true }).text,
    ).toBe(5000)
  })

  test("supports the Telegram steps plus sendCard", () => {
    const { steps } = CHANNEL_FLOW_POLICIES.line
    for (const stepType of [
      stepTypes.enum.sendText,
      stepTypes.enum.sendImage,
      stepTypes.enum.sendVideo,
      stepTypes.enum.sendMultipleImages,
      stepTypes.enum.sendAudio,
      stepTypes.enum.sendFile,
      stepTypes.enum.sendGif,
      stepTypes.enum.sendQuickReply,
      stepTypes.enum.sendCarousel,
      stepTypes.enum.sendCard,
    ]) {
      expect(steps[stepType]).toBe("full")
    }
  })

  test("allows 5 buttons on a text step and rejects a sixth", () => {
    const node = (count: number) =>
      lineNode([
        sendTextStepDefaultFn({ text: "Choose", buttons: buttons(count) }),
      ])
    expect(collectIssues(node(5))).toEqual([])
    expect(collectIssues(node(6))).toContainEqual(
      expect.objectContaining({
        message: "sendText exceeds the line maximum of 5 buttons.",
        path: [0, "data", "details", "steps", 0, "buttons"],
        params: {
          capability: expect.objectContaining({
            actual: 6,
            allowed: 5,
            channel: "line",
            code: "constraintExceeded",
            constraintId: "maxButtonCount",
          }),
        },
      }),
    )
  })

  test("allows 5 buttons on a media step and rejects a sixth", () => {
    const node = (count: number) =>
      lineNode([
        {
          ...sendImageStepDefaultFn(),
          url: "https://example.com/a.png",
          buttons: buttons(count),
        },
      ])
    expect(collectIssues(node(5))).toEqual([])
    expect(collectIssues(node(6))).toContainEqual(
      expect.objectContaining({
        message: "sendImage exceeds the line maximum of 5 buttons.",
      }),
    )
  })

  test("allows 5 buttons on a card and rejects a sixth", () => {
    const node = (count: number) => lineNode([card(count)])
    expect(collectIssues(node(5))).toEqual([])
    // Six is over the card schema's ceiling too; the channel issue still names LINE.
    expect(collectIssues(node(6))).toContainEqual(
      expect.objectContaining({
        message: "sendCard exceeds the line maximum of 5 buttons.",
        path: [0, "data", "details", "steps", 0, "buttons"],
      }),
    )
  })

  test("checks every carousel card against the card limit", () => {
    const node = (counts: number[]) =>
      lineNode([
        {
          ...sendCarouselStepDefaultFn(),
          cards: counts.map((count) => card(count)),
        },
      ])
    expect(collectIssues(node([5, 5]))).toEqual([])
    expect(collectIssues(node([5, 6]))).toContainEqual(
      expect.objectContaining({
        message: "sendCarousel exceeds the line maximum of 5 buttons.",
        path: [0, "data", "details", "steps", 0, "cards", 1, "buttons"],
        params: {
          capability: expect.objectContaining({ actual: 6, allowed: 5 }),
        },
      }),
    )
  })

  test("publishes 5-button text, card and carousel steps through the publish schema", () => {
    const node = lineNode([
      sendTextStepDefaultFn({ text: "Choose", buttons: buttons(5) }),
      card(5),
      { ...sendCarouselStepDefaultFn(), cards: [card(5), card(5)] },
    ])
    const result = z
      .array(flowVersionSchema)
      .superRefine(refineStepsByChannel)
      .safeParse([node])
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true)
  })

  test("declares all three button styles with link as the default", () => {
    expect(CHANNEL_FLOW_POLICIES.line.buttonStyles).toEqual({
      options: ["primary", "secondary", "link"],
      default: "link",
    })
  })

  test("pins the policy version clients cache (bumped for card limits and styles)", () => {
    expect(CHANNEL_POLICY_VERSION).toBe(4)
  })

  test("rejects sendText over 5000 characters", () => {
    const node = lineNode([sendTextStepDefaultFn({ text: "a".repeat(5001) })])
    expect(collectIssues(node)).toContainEqual(
      expect.objectContaining({ message: "sendTextTooLongForChannel" }),
    )
  })

  test("accepts sendText of 5000 characters", () => {
    expect(
      collectIssues(
        lineNode([sendTextStepDefaultFn({ text: "a".repeat(5000) })]),
      ),
    ).toEqual([])
  })

  test("does not support whatsappFlow", () => {
    expect(CHANNEL_FLOW_POLICIES.line.steps.whatsappFlow).toBe("unsupported")
  })
})
