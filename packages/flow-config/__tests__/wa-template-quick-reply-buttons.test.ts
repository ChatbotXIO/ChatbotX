import { describe, expect, test } from "vitest"
import {
  bindWaTemplateQuickReplyButtons,
  buttonStepDefaultFn,
  extractParameterInfos,
  extractTemplateParams,
  extractTemplateQuickReplyButtons,
  seedWaTemplateStepButtons,
  sendWaTemplateMessageStepSchema,
  stepTypes,
  type TemplateComponent,
  WA_TEMPLATE_STATUS_BUTTON_COUNT,
} from "../src"

const buttonsComponent = (
  buttons: Record<string, unknown>[],
): TemplateComponent =>
  ({ type: "BUTTONS", buttons }) as unknown as TemplateComponent

// The failing production shape: a static (non-parameterized) button BEFORE a
// parameterized one, so dense param positions diverge from template indexes.
const staticUrlThenQuickReply = [
  buttonsComponent([
    { type: "URL", text: "Clique aqui", url: "https://example.com/a" },
    { type: "QUICK_REPLY", text: "Parar mensagens" },
  ]),
]

describe("extractTemplateParams — quick replies are zero-config", () => {
  test("creates NO param entry for quick reply buttons", () => {
    const params = extractTemplateParams(staticUrlThenQuickReply)
    expect(params.button).toBeUndefined()
  })

  test("still creates entries for dynamic URL buttons, with template index preserved", () => {
    const params = extractTemplateParams([
      buttonsComponent([
        { type: "QUICK_REPLY", text: "Stop" },
        { type: "URL", text: "Shop", url: "https://example.com/{{1}}" },
      ]),
    ])

    expect(params.button).toEqual([{ sub_type: "url", index: 1, text: "" }])
  })
})

describe("extractParameterInfos — dense paramIndex for button fields", () => {
  test("emits no parameter info for quick reply buttons", () => {
    const infos = extractParameterInfos(staticUrlThenQuickReply)
    expect(infos).toEqual([])
  })

  test("paramIndex is the dense position while buttonIndex stays the template index", () => {
    const infos = extractParameterInfos([
      buttonsComponent([
        { type: "PHONE_NUMBER", text: "Call", phone_number: "+15550001111" },
        { type: "URL", text: "Shop", url: "https://example.com/{{1}}" },
        { type: "COPY_CODE", text: "Copy" },
      ]),
    ])

    expect(infos).toEqual([
      expect.objectContaining({
        buttonSubType: "url",
        buttonIndex: 1,
        paramIndex: 0,
      }),
      expect.objectContaining({
        buttonSubType: "copy_code",
        buttonIndex: 2,
        paramIndex: 1,
      }),
    ])
  })
})

describe("extractTemplateQuickReplyButtons", () => {
  test("returns quick replies with their template button index", () => {
    expect(extractTemplateQuickReplyButtons(staticUrlThenQuickReply)).toEqual([
      { templateButtonIndex: 1, text: "Parar mensagens" },
    ])
  })

  test("returns an empty list when the template has no quick replies", () => {
    expect(
      extractTemplateQuickReplyButtons([
        buttonsComponent([
          { type: "URL", text: "Open", url: "https://example.com" },
        ]),
      ]),
    ).toEqual([])
  })
})

describe("seedWaTemplateStepButtons", () => {
  const statusButtons = [
    buttonStepDefaultFn({ label: "Delivered" }),
    buttonStepDefaultFn({ label: "Failed" }),
  ]

  test("keeps the status branches in front and appends one button per quick reply", () => {
    const seeded = seedWaTemplateStepButtons(
      statusButtons,
      staticUrlThenQuickReply,
    )

    expect(seeded).toHaveLength(WA_TEMPLATE_STATUS_BUTTON_COUNT + 1)
    expect(seeded[0]).toBe(statusButtons[0])
    expect(seeded[1]).toBe(statusButtons[1])
    expect(seeded[2].label).toBe("Parar mensagens")
  })

  test("truncates quick reply labels to the step button label limit", () => {
    const seeded = seedWaTemplateStepButtons(statusButtons, [
      buttonsComponent([{ type: "QUICK_REPLY", text: "A".repeat(25) }]),
    ])

    expect(seeded[2].label).toBe("A".repeat(20))
  })

  test("reselecting a template with the same quick replies keeps button ids (edges survive)", () => {
    const firstSeed = seedWaTemplateStepButtons(
      statusButtons,
      staticUrlThenQuickReply,
    )
    const secondSeed = seedWaTemplateStepButtons(
      firstSeed,
      staticUrlThenQuickReply,
    )

    expect(secondSeed[2]).toBe(firstSeed[2])
  })

  test("a template text edit keeps the button's id and configured action — only the label follows", () => {
    const firstSeed = seedWaTemplateStepButtons(
      statusButtons,
      staticUrlThenQuickReply,
    )
    const renamedTemplate = [
      buttonsComponent([
        { type: "URL", text: "Clique aqui", url: "https://example.com/a" },
        { type: "QUICK_REPLY", text: "Stop now" },
      ]),
    ]

    const secondSeed = seedWaTemplateStepButtons(firstSeed, renamedTemplate)

    expect(secondSeed[2].id).toBe(firstSeed[2].id)
    expect(secondSeed[2].label).toBe("Stop now")
  })

  test("switching to a template without quick replies drops the tail but keeps status branches", () => {
    const seeded = seedWaTemplateStepButtons(
      seedWaTemplateStepButtons(statusButtons, staticUrlThenQuickReply),
      [buttonsComponent([{ type: "URL", text: "Open", url: "https://x.co" }])],
    )

    expect(seeded).toEqual(statusButtons)
  })
})

describe("sendWaTemplateMessageStepSchema — legacy data and configured buttons", () => {
  const baseStep = {
    id: "1",
    nodeId: "node-1",
    stepType: stepTypes.enum.sendWaTemplateMessage,
    template: {
      id: "tmpl-1",
      name: "tpl",
      language: "en",
      inboxId: null,
      params: {},
    },
    buttons: [],
  }

  test("accepts and strips null holes persisted by the old sparse form arrays", () => {
    const parsed = sendWaTemplateMessageStepSchema.parse({
      ...baseStep,
      template: {
        ...baseStep.template,
        params: {
          button: [null, { sub_type: "quick_reply", index: 1, payload: "" }],
        },
      },
    })

    expect(parsed.template.params.button).toEqual([
      { sub_type: "quick_reply", index: 1, payload: "" },
    ])
  })

  test("strips null holes inside carousel card buttons too", () => {
    const parsed = sendWaTemplateMessageStepSchema.parse({
      ...baseStep,
      template: {
        ...baseStep.template,
        params: {
          carousel: [
            {
              card_index: 0,
              button: [null, { sub_type: "url", index: 1, text: "suffix" }],
            },
          ],
        },
      },
    })

    expect(parsed.template.params.carousel?.[0]?.button).toEqual([
      { sub_type: "url", index: 1, text: "suffix" },
    ])
  })

  test("preserves a quick-reply button's configured action through parse (publish must not wipe it)", () => {
    const configuredButton = {
      id: "11612473309626372",
      label: "Parar mensagens",
      buttonType: "startAnotherNode" as const,
      beforeStep: {
        id: "11612473309626373",
        stepType: "startAnotherNode" as const,
        nodeId: "11612473309626374",
      },
      steps: [],
    }

    const parsed = sendWaTemplateMessageStepSchema.parse({
      ...baseStep,
      buttons: [
        buttonStepDefaultFn({ label: "Delivered" }),
        buttonStepDefaultFn({ label: "Failed" }),
        configuredButton,
      ],
    })

    expect(parsed.buttons[2]).toMatchObject({
      label: "Parar mensagens",
      buttonType: "startAnotherNode",
      beforeStep: { nodeId: "11612473309626374" },
    })
  })

  test("an empty buttons list still falls back to the Delivered/Failed status defaults", () => {
    const parsed = sendWaTemplateMessageStepSchema.parse(baseStep)

    expect(parsed.buttons.map((button) => button.label)).toEqual([
      "Delivered",
      "Failed",
    ])
  })
})

describe("bindWaTemplateQuickReplyButtons", () => {
  test("pairs quick replies with the seeded tail by position", () => {
    const tailButton = buttonStepDefaultFn({ label: "Parar mensagens" })
    const bindings = bindWaTemplateQuickReplyButtons(staticUrlThenQuickReply, [
      buttonStepDefaultFn({ label: "Delivered" }),
      buttonStepDefaultFn({ label: "Failed" }),
      tailButton,
    ])

    expect(bindings).toEqual([
      { templateButtonIndex: 1, stepButton: tailButton },
    ])
  })

  test("legacy steps with only status buttons yield no bindings", () => {
    const bindings = bindWaTemplateQuickReplyButtons(staticUrlThenQuickReply, [
      buttonStepDefaultFn({ label: "Delivered" }),
      buttonStepDefaultFn({ label: "Failed" }),
    ])

    expect(bindings).toEqual([])
  })
})
