import { describe, expect, test } from "vitest"
import { refineStepsByChannel } from "../src/channel-rules/channel-step-refinement"
import { sendTextValidator } from "../src/channel-rules/send-text-validator"
import {
  isTiktokCardTitleTruncated,
  isTiktokQuickReplyCardTitleTooLong,
  TIKTOK_CARD_TITLE_MAX,
} from "../src/channel-rules/tiktok-text-rules"
import { sendMessageNodeDefaultFn } from "../src/nodes/send-message"
import { buttonStepDefaultFn } from "../src/steps/button"
import { chooseChannelStepDefaultFn } from "../src/steps/choose-channel"
import {
  sendTextStepDefaultFn,
  sendTextStepSchema,
} from "../src/steps/send-text"
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

  test("true when the node's quick replies are the only buttons", () => {
    // convertFlowStepText builds a TEMPLATE as soon as either the step's
    // buttons or the node's quick replies are present, so quick replies alone
    // produce the same truncated card title.
    expect(
      isTiktokCardTitleTruncated({
        channel: "tiktok",
        buttons: [],
        quickReplyCount: 1,
        text: "x".repeat(TIKTOK_CARD_TITLE_MAX + 1),
      }),
    ).toBe(true)
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

describe("refineStepsByChannel — node-level quick replies", () => {
  const longText = "x".repeat(TIKTOK_CARD_TITLE_MAX + 1)

  const tiktokNode = (props: {
    text: string
    buttons?: ReturnType<typeof button>[]
    quickReplies?: ReturnType<typeof button>[]
    channel?: string
  }) =>
    sendMessageNodeDefaultFn({
      nodeProps: {},
      detailProps: {
        beforeStep: chooseChannelStepDefaultFn({
          channel: props.channel ?? "tiktok",
        }),
        steps: [
          sendTextStepDefaultFn({
            text: props.text,
            buttons: props.buttons ?? [],
          }),
        ],
        quickReplies: props.quickReplies ?? [],
      },
    })

  const collectIssues = (node: ReturnType<typeof tiktokNode>) => {
    const issues: { message: string; path: PropertyKey[] }[] = []
    const ctx = {
      addIssue: (issue: { message: string; path: PropertyKey[] }) =>
        issues.push(issue),
    }

    refineStepsByChannel(
      [node] as Parameters<typeof refineStepsByChannel>[0],
      ctx as unknown as Parameters<typeof refineStepsByChannel>[1],
    )

    return issues
  }

  test("blocks publish when quick replies alone overflow the card title", () => {
    const issues = collectIssues(
      tiktokNode({ text: longText, quickReplies: [button()] }),
    )

    expect(issues.map((issue) => issue.message)).toEqual([
      flowValidationCodes.tiktokCardTitleTooLong,
    ])
    expect(issues[0]?.path).toEqual([0, "data", "details", "steps", 0, "text"])
  })

  test("raises the code once, not twice, when the step also has buttons", () => {
    // refineTiktokSendTextStep already catches this through the validator map.
    const issues = collectIssues(
      tiktokNode({
        text: longText,
        buttons: [button()],
        quickReplies: [button("No")],
      }),
    )

    expect(issues.map((issue) => issue.message)).toEqual([
      flowValidationCodes.tiktokCardTitleTooLong,
    ])
  })

  test("stays quiet when the text fits the card title", () => {
    expect(
      collectIssues(
        tiktokNode({ text: "Choose one", quickReplies: [button()] }),
      ),
    ).toEqual([])
  })

  test("stays quiet with no quick replies and no buttons", () => {
    expect(collectIssues(tiktokNode({ text: longText }))).toEqual([])
  })

  test("stays quiet on omnichannel, which may never reach a tiktok contact", () => {
    expect(
      collectIssues(
        tiktokNode({
          text: longText,
          quickReplies: [button()],
          channel: "omnichannel",
        }),
      ),
    ).toEqual([])
  })
})

describe("isTiktokQuickReplyCardTitleTooLong", () => {
  test("false once the step carries buttons of its own", () => {
    expect(
      isTiktokQuickReplyCardTitleTooLong({
        step: {
          text: "x".repeat(TIKTOK_CARD_TITLE_MAX + 1),
          buttons: [button()],
        },
        quickReplyCount: 1,
      }),
    ).toBe(false)
  })

  test("true for quick replies alone", () => {
    expect(
      isTiktokQuickReplyCardTitleTooLong({
        step: { text: "x".repeat(TIKTOK_CARD_TITLE_MAX + 1), buttons: [] },
        quickReplyCount: 1,
      }),
    ).toBe(true)
  })

  test("false when there are no quick replies", () => {
    expect(
      isTiktokQuickReplyCardTitleTooLong({
        step: { text: "x".repeat(TIKTOK_CARD_TITLE_MAX + 1), buttons: [] },
        quickReplyCount: 0,
      }),
    ).toBe(false)
  })
})

describe("sendTextStepSchema", () => {
  const buttonedStep = {
    buttons: [button()],
    id: "1",
    stepType: "sendText" as const,
    text: "x".repeat(TIKTOK_CARD_TITLE_MAX + 1),
  }

  test("sendTextValidator.omnichannel carries no TikTok rule", () => {
    // The base now refines on message length per channel, so it is no longer
    // the bare schema — what matters here is that TikTok's card title rule
    // stays off it: an omnichannel flow may never reach a TikTok contact.
    expect(sendTextValidator.omnichannel.safeParse(buttonedStep).success).toBe(
      true,
    )
    expect(sendTextStepSchema.safeParse(buttonedStep).success).toBe(true)
  })
})
