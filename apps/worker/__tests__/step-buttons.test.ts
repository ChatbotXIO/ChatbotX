import type { ButtonStepProps } from "@chatbotx.io/flow-config"
import type { SendFlowStepData } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import { mapStepButtons, readStepButtons } from "../src/chat/utils/step-buttons"

const button = (id: string) => ({ id, label: id }) as ButtonStepProps

const step = {
  id: "1",
  stepType: "sendCarousel",
  buttons: [button("a")],
  cards: [{ title: "A", buttons: [button("b")] }, { title: "B" }],
} as unknown as SendFlowStepData

describe("step buttons", () => {
  test("reads the step's own buttons, then each card's", () => {
    expect(readStepButtons(step).map((item) => item.id)).toEqual(["a", "b"])
  })

  test("maps every button group and leaves cards without buttons alone", async () => {
    const mapped = (await mapStepButtons(step, (buttons) =>
      buttons.map((item) => ({ ...item, label: item.label.toUpperCase() })),
    )) as unknown as {
      buttons: ButtonStepProps[]
      cards: { title: string; buttons?: ButtonStepProps[] }[]
    }

    expect(mapped.buttons[0]?.label).toBe("A")
    expect(mapped.cards[0]?.buttons?.[0]?.label).toBe("B")
    expect(mapped.cards[1]).toEqual({ title: "B" })
  })
})
