import { describe, expect, test } from "vitest"
import {
  buttonStepDefaultFn,
  extractMessengerFlowButtons,
  flowValidationCodes,
  type MessengerTemplateComponent,
  mergeMessengerFlowButtonsWithExisting,
  openMiniAppStepDefaultFn,
  readMessengerMiniAppButtons,
  sendMessengerTemplateMessageStepDefaultFn,
  sendMessengerTemplateMessageStepSchema,
  sendWaTemplateMessageStepDefaultFn,
  sendWaTemplateMessageStepSchema,
} from "../src"

const miniAppButton = {
  ...buttonStepDefaultFn({ label: "Form" }),
  buttonType: "openMiniApp" as const,
  beforeStep: openMiniAppStepDefaultFn({ miniAppId: "7" }),
}

const template = { id: "1", name: "welcome", language: "en", params: {} }

describe("Open Mini App buttons on template steps", () => {
  test("a WhatsApp template step rejects them", () => {
    const step = sendWaTemplateMessageStepDefaultFn({ template } as never)

    expect(sendWaTemplateMessageStepSchema.safeParse(step).success).toBe(true)

    const result = sendWaTemplateMessageStepSchema.safeParse({
      ...step,
      buttons: [...step.buttons, miniAppButton],
    })
    expect(result.error?.issues[0]?.message).toBe(
      flowValidationCodes.templateButtonOpenMiniAppUnsupported,
    )
  })

  test("a Messenger template step accepts them", () => {
    const step = sendMessengerTemplateMessageStepDefaultFn({
      template,
    } as never)

    expect(
      sendMessengerTemplateMessageStepSchema.safeParse({
        ...step,
        buttons: [miniAppButton],
      }).success,
    ).toBe(true)
  })
})

const components: MessengerTemplateComponent[] = [
  { type: "BODY", text: "Hi" },
  {
    type: "BUTTONS",
    buttons: [
      { type: "POSTBACK", text: "Yes", payload: "{{1}}" },
      {
        type: "URL",
        text: "Fill form",
        url: "https://app.example.com/mini-apps?id=42&token={{1}}",
      },
      { type: "URL", text: "Site", url: "https://example.com/{{1}}" },
    ],
  },
]

describe("Messenger template Mini App buttons", () => {
  test("reads the template's Mini App URL buttons with their position", () => {
    expect(readMessengerMiniAppButtons(components)).toEqual([
      { index: 1, label: "Fill form", miniAppId: "42" },
    ])
  })

  test("only a flow step routes Mini App buttons, in template order", () => {
    expect(
      extractMessengerFlowButtons(components).map(
        (button) => button.buttonType,
      ),
    ).toEqual([null])

    const flowButtons = extractMessengerFlowButtons(components, {
      includeMiniApp: true,
    })
    expect(flowButtons.map((button) => button.label)).toEqual([
      "Yes",
      "Fill form",
    ])
    expect(flowButtons[1]).toMatchObject({
      buttonType: "openMiniApp",
      beforeStep: { stepType: "openMiniApp", miniAppId: "42" },
    })
  })

  test("keeps an existing Mini App button's id and follows the template's Mini App", () => {
    const existing = {
      ...miniAppButton,
      id: "900",
      beforeStep: openMiniAppStepDefaultFn({ miniAppId: "7" }),
    }
    const [templateButton] = extractMessengerFlowButtons(
      [components[1] as MessengerTemplateComponent].map((component) => ({
        ...component,
        buttons: component.buttons?.slice(1, 2),
      })),
      { includeMiniApp: true },
    )

    const [merged] = mergeMessengerFlowButtonsWithExisting(
      [templateButton as never],
      [existing],
    )
    expect(merged?.id).toBe("900")
    expect(merged).toMatchObject({
      buttonType: "openMiniApp",
      beforeStep: { miniAppId: "42" },
    })
  })

  test("a slot that switched between postback and Mini App takes the template's button", () => {
    const postback = { ...buttonStepDefaultFn({ label: "Old" }), id: "901" }
    const templateButtons = extractMessengerFlowButtons(components, {
      includeMiniApp: true,
    })

    const merged = mergeMessengerFlowButtonsWithExisting(templateButtons, [
      postback,
      postback,
    ])
    expect(merged[0]?.id).toBe("901")
    expect(merged[1]).toBe(templateButtons[1])
  })
})
