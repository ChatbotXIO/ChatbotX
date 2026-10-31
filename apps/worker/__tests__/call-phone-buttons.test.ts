import {
  type ButtonStepProps,
  normalizeDialablePhoneNumber,
} from "@chatbotx.io/flow-config"
import type { SendFlowStepData } from "@chatbotx.io/sdk"
import { describe, expect, test, vi } from "vitest"

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }))
vi.mock("../src/lib/logger", () => ({ logger: { warn } }))

import { resolveCallPhoneButtons } from "../src/chat/utils/call-phone-buttons"

const callButton = (id: string, phoneNumber: string, label = "Call us") =>
  ({
    id,
    label,
    buttonType: "callPhoneNumber",
    beforeStep: { id: `s${id}`, stepType: "callPhoneNumber", phoneNumber },
    steps: [],
  }) as ButtonStepProps

const replyButton = (id: string) =>
  ({
    id,
    label: "Hi",
    buttonType: null,
    beforeStep: null,
    steps: [],
  }) as ButtonStepProps

const textStep = (buttons: ButtonStepProps[]) =>
  ({
    id: "1",
    stepType: "sendText",
    text: "Hello",
    buttons,
  }) as SendFlowStepData

const run = (channel: string, step: SendFlowStepData) =>
  resolveCallPhoneButtons({ workspaceId: "1", flowId: "2", channel, step })

const buttonsOf = (step: SendFlowStepData) =>
  "buttons" in step ? (step.buttons as ButtonStepProps[]) : []

describe("normalizeDialablePhoneNumber", () => {
  test.each([
    ["+1 (415) 555-2671", "+14155552671"],
    ["+44 20 7946 0958", "+442079460958"],
    ["+49 151 2345-6789", "+4915123456789"],
    ["+91 98765 43210", "+919876543210"],
    ["+55 (11) 98765-4321", "+5511987654321"],
    ["+81 3-1234-5678", "+81312345678"],
    ["+39 06 1234 5678", "+390612345678"],
    ["+1 415 555 2671", "+14155552671"],
    ["+800 1234 5678", "+80012345678"],
    ["  +14155552671  ", "+14155552671"],
  ])("normalises %s", (input, expected) => {
    expect(normalizeDialablePhoneNumber(input)).toBe(expected)
  })

  test.each([
    ["an empty value", ""],
    ["a national number", "0901234567"],
    ["a number without a plus", "14155552671"],
    ["an unresolved token", "{{contact.phone}}"],
    ["surrounding junk", "call +14155552671 now"],
    ["too many digits", "+1415555267100000000"],
    ["an impossible number", "+44123"],
  ])("rejects %s", (_name, input) => {
    expect(normalizeDialablePhoneNumber(input)).toBeNull()
  })
})

describe("resolveCallPhoneButtons", () => {
  test("returns the same step when it has no call button", async () => {
    const step = textStep([replyButton("1")])
    expect(await run("messenger", step)).toBe(step)
  })

  test("keeps the label and normalises the number on a native channel", async () => {
    const [button] = buttonsOf(
      await run("messenger", textStep([callButton("1", "+1 415 555 2671")])),
    )
    expect(button).toMatchObject({
      label: "Call us",
      buttonType: "callPhoneNumber",
      beforeStep: { phoneNumber: "+14155552671" },
    })
  })

  test("appends the number to the label on a fallback channel when it fits", async () => {
    const [button] = buttonsOf(
      await run(
        "telegram",
        textStep([callButton("1", "+14155552671", "Call")]),
      ),
    )
    expect(button?.label).toBe("Call +14155552671")
  })

  test("uses just the number when the label plus number exceeds the limit", async () => {
    const [button] = buttonsOf(
      await run(
        "telegram",
        textStep([callButton("1", "+14155552671", "Call us now")]),
      ),
    )
    expect(button?.label).toBe("+14155552671")
  })

  test("counts an emoji label with the channel's character rules", async () => {
    const [button] = buttonsOf(
      await run(
        "telegram",
        textStep([callButton("1", "+14155552671", "📞📞📞📞📞📞📞📞📞")]),
      ),
    )
    expect(button?.label).toBe("+14155552671")
  })

  test("degrades an invalid number to an inert button and logs it", async () => {
    const [button] = buttonsOf(
      await run("messenger", textStep([callButton("1", "{{contact.phone}}")])),
    )
    expect(button).toEqual({
      id: "1",
      label: "Call us",
      buttonType: null,
      beforeStep: null,
      steps: [],
    })
    expect(warn).toHaveBeenCalled()
  })

  test.each([
    "messenger",
    "whatsapp",
  ])("keeps the button count of every card on %s when one number is invalid", async (channel) => {
    const card = (number: string) => ({
      id: "c",
      title: "Card",
      buttons: [callButton("1", number)],
    })
    const step = {
      id: "1",
      stepType: "sendCarousel",
      cards: [card("+14155552671"), card("junk")],
    } as unknown as SendFlowStepData
    const result = (await run(channel, step)) as unknown as {
      cards: { buttons: ButtonStepProps[] }[]
    }
    expect(result.cards.map((c) => c.buttons.length)).toEqual([1, 1])
    expect(result.cards[0]?.buttons[0]?.buttonType).toBe("callPhoneNumber")
    expect(result.cards[1]?.buttons[0]?.buttonType).toBeNull()
  })
})
