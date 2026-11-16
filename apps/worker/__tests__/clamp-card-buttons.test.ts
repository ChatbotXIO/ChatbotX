import type { SendFlowStepData } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import { clampCardButtonsToChannel } from "../src/chat/utils/clamp-card-buttons"

const buttons = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `b${index + 1}` }))

const asStep = (value: unknown) => value as SendFlowStepData

describe("clampCardButtonsToChannel", () => {
  test("leaves text and media step buttons to the integration", () => {
    for (const stepType of ["sendText", "sendImage", "sendVideo"]) {
      const step = asStep({ stepType, buttons: buttons(10) })
      expect(clampCardButtonsToChannel(step, "messenger").step).toBe(step)
    }
  })

  test("cuts a sendCard step to the card limit, keeping the leading buttons", () => {
    const { step, dropped } = clampCardButtonsToChannel(
      asStep({ stepType: "sendCard", title: "x", buttons: buttons(5) }),
      "telegram",
    )
    expect("buttons" in step && step.buttons.map((b) => b.id)).toEqual([
      "b1",
      "b2",
      "b3",
    ])
    expect(dropped).toEqual([{ group: "step", kept: 3, dropped: 2 }])
  })

  test("cuts each carousel card to the card limit", () => {
    const { step, dropped } = clampCardButtonsToChannel(
      asStep({
        stepType: "sendCarousel",
        cards: [{ buttons: buttons(2) }, { buttons: buttons(5) }],
      }),
      "whatsapp",
    )
    expect(
      "cards" in step && step.cards.map((card) => card.buttons.length),
    ).toEqual([2, 3])
    expect(dropped).toEqual([{ group: "cards.1", kept: 3, dropped: 2 }])
  })

  test("returns the same step when within limits, on LINE, or for an unknown channel", () => {
    const step = asStep({
      stepType: "sendCard",
      title: "x",
      buttons: buttons(5),
    })
    expect(clampCardButtonsToChannel(step, "line").step).toBe(step)
    expect(clampCardButtonsToChannel(step, "unknown").step).toBe(step)
  })

  test("never touches quick-reply steps", () => {
    const step = asStep({ stepType: "sendQuickReply", buttons: buttons(13) })
    expect(clampCardButtonsToChannel(step, "messenger").step).toBe(step)
  })
})
