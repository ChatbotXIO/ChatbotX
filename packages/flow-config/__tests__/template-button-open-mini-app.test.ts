import { describe, expect, test } from "vitest"
import {
  buttonStepDefaultFn,
  flowValidationCodes,
  openMiniAppStepDefaultFn,
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

describe("template steps reject Open Mini App buttons", () => {
  test.each([
    [
      "WhatsApp",
      sendWaTemplateMessageStepSchema,
      sendWaTemplateMessageStepDefaultFn,
    ],
    [
      "Messenger",
      sendMessengerTemplateMessageStepSchema,
      sendMessengerTemplateMessageStepDefaultFn,
    ],
  ] as const)("%s template", (_label, schema, defaultFn) => {
    const step = defaultFn({ template } as never)

    expect(schema.safeParse(step).success).toBe(true)

    const result = schema.safeParse({
      ...step,
      buttons: [...step.buttons, miniAppButton],
    })
    expect(result.error?.issues[0]?.message).toBe(
      flowValidationCodes.templateButtonOpenMiniAppUnsupported,
    )
  })
})
