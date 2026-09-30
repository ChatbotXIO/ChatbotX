import { describe, expect, test } from "vitest"
import { refineStepsByChannel } from "../src/channel-rules/channel-step-refinement"
import { STEP_SUPPORT } from "../src/channel-rules/step-support"
import { sendMessageNodeDefaultFn } from "../src/nodes/send-message"
import { buttonStepDefaultFn, buttonStepSchema } from "../src/steps/button"
import { chooseChannelStepDefaultFn } from "../src/steps/choose-channel"
import { sendCardStepDefaultFn } from "../src/steps/send-card"
import { sendTextStepDefaultFn } from "../src/steps/send-text"
import { stepTypes } from "../src/steps/step-action"

describe("STEP_SUPPORT", () => {
  test("covers every step type for every managed channel", () => {
    for (const policy of Object.values(STEP_SUPPORT)) {
      expect(Object.keys(policy.stepSupport).sort()).toEqual(
        [...stepTypes.options].sort(),
      )
    }
  })

  test("blocks TikTok blocks the runtime cannot send", () => {
    const node = sendMessageNodeDefaultFn({
      nodeProps: {},
      detailProps: {
        beforeStep: chooseChannelStepDefaultFn({ channel: "tiktok" }),
        quickReplies: [],
        steps: [sendCardStepDefaultFn()],
      },
    })
    const issues: { message: string; path: PropertyKey[] }[] = []

    refineStepsByChannel([node], {
      addIssue: (issue: { message: string; path: PropertyKey[] }) =>
        issues.push(issue),
    } as never)

    expect(issues).toContainEqual(
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

    const collectIssues = (buttonCount: number) => {
      const issues: { message: string; path: PropertyKey[] }[] = []
      refineStepsByChannel([makeNode(buttonCount)], {
        addIssue: (issue: { message: string; path: PropertyKey[] }) =>
          issues.push(issue),
      } as never)
      return issues
    }

    expect(collectIssues(3)).toEqual([])
    expect(collectIssues(4)).toContainEqual(
      expect.objectContaining({
        message: "constraintExceeded",
        path: [0, "data", "details", "steps", 0, "buttons"],
      }),
    )
  })
  test("counts button labels by Unicode code point", () => {
    const validAsciiLabel = "a".repeat(20)
    const invalidAsciiLabel = "a".repeat(21)
    const validEmojiLabel = "😀".repeat(20)
    const invalidEmojiLabel = "😀".repeat(21)
    const validCombiningLabel = "e\u0301".repeat(10)
    const invalidCombiningLabel = "e\u0301".repeat(11)

    expect(
      buttonStepSchema.safeParse({
        ...buttonStepDefaultFn(),
        label: validAsciiLabel,
      }).success,
    ).toBe(true)
    expect(
      buttonStepSchema.safeParse({
        ...buttonStepDefaultFn(),
        label: invalidAsciiLabel,
      }).success,
    ).toBe(false)

    expect(
      buttonStepSchema.safeParse({
        ...buttonStepDefaultFn(),
        label: validEmojiLabel,
      }).success,
    ).toBe(true)
    expect(
      buttonStepSchema.safeParse({
        ...buttonStepDefaultFn(),
        label: invalidEmojiLabel,
      }).success,
    ).toBe(false)
    expect(
      buttonStepSchema.safeParse({
        ...buttonStepDefaultFn(),
        label: validCombiningLabel,
      }).success,
    ).toBe(true)
    expect(
      buttonStepSchema.safeParse({
        ...buttonStepDefaultFn(),
        label: invalidCombiningLabel,
      }).success,
    ).toBe(false)
  })
})
