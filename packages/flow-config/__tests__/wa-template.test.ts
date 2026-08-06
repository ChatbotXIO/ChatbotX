import { describe, expect, test } from "vitest"
import {
  extractTemplateParams,
  isNamedTemplateToken,
  sendWaTemplateMessageStepSchema,
  type TemplateComponent,
} from "../src/steps/send-wa-message-template"
import { extractParameterInfos } from "../src/steps/wa-template-utils"

// ─── isNamedTemplateToken ────────────────────────────────────────────────────
// Meta placeholders are positional ({{1}}) or named ({{order_id}}). A purely
// numeric token is positional; anything else is a named parameter that must be
// echoed back to Meta as `parameter_name` on every send-time parameter.

describe("isNamedTemplateToken", () => {
  test.each([
    ["1", false],
    ["2", false],
    ["12", false],
    ["user_name", true],
    ["order_id", true],
    ["first_name", true],
  ])("token %s → named=%s", (token, expected) => {
    expect(isNamedTemplateToken(token)).toBe(expected)
  })
})

// ─── extractTemplateParams — BODY ────────────────────────────────────────────

describe("extractTemplateParams BODY", () => {
  test("POSITIONAL — {{1}} {{2}} → two text params WITHOUT parameter_name", () => {
    const components: TemplateComponent[] = [
      { type: "BODY", text: "Hi {{1}} and {{2}}" },
    ]
    expect(extractTemplateParams(components).body).toEqual([
      { type: "text", text: "" },
      { type: "text", text: "" },
    ])
  })

  test("NAMED — single {{user_name}} → one text param WITH parameter_name", () => {
    const components: TemplateComponent[] = [
      { type: "BODY", text: "Happy Birthday, {{user_name}}!" },
    ]
    expect(extractTemplateParams(components).body).toEqual([
      { type: "text", text: "", parameter_name: "user_name" },
    ])
  })

  test("NAMED — multiple placeholders keep their own names", () => {
    const components: TemplateComponent[] = [
      { type: "BODY", text: "Hi {{first_name}}, order {{order_id}} is ready" },
    ]
    expect(extractTemplateParams(components).body).toEqual([
      { type: "text", text: "", parameter_name: "first_name" },
      { type: "text", text: "", parameter_name: "order_id" },
    ])
  })

  test("no variables → body stays undefined", () => {
    const components: TemplateComponent[] = [
      { type: "BODY", text: "Static body with no variables" },
    ]
    expect(extractTemplateParams(components).body).toBeUndefined()
  })
})

// ─── extractTemplateParams — HEADER TEXT ─────────────────────────────────────

describe("extractTemplateParams HEADER TEXT", () => {
  test("POSITIONAL — {{1}} → no parameter_name", () => {
    const components: TemplateComponent[] = [
      { type: "HEADER", format: "TEXT", text: "Order {{1}}" },
    ]
    expect(extractTemplateParams(components).header).toEqual([
      { type: "text", text: "" },
    ])
  })

  test("NAMED — {{store_name}} → parameter_name", () => {
    const components: TemplateComponent[] = [
      { type: "HEADER", format: "TEXT", text: "From {{store_name}}" },
    ]
    expect(extractTemplateParams(components).header).toEqual([
      { type: "text", text: "", parameter_name: "store_name" },
    ])
  })
})

// ─── FLOW button — numeric flow_id coercion ──────────────────────────────────
// Meta delivers a template FLOW button's `flow_id` as a JSON number. Both
// extractors must coerce it to a string, otherwise it trips the `z.string()`
// schema ("expected string, received number") and never matches the string
// `WhatsappFlow.sourceId` used to resolve/save custom-field mappings.
describe("FLOW button flow_id coercion", () => {
  const components: TemplateComponent[] = [
    { type: "BODY", text: "Hello world!" },
    {
      type: "BUTTONS",
      buttons: [
        {
          type: "FLOW",
          text: "View Flow",
          flow_id: 1_690_702_985_711_558,
          flow_action: "NAVIGATE",
          navigate_screen: "RECOMMEND",
        },
      ],
    },
  ]

  test("extractTemplateParams yields a string flowSourceId", () => {
    const flowButton = extractTemplateParams(components).button?.[0]
    expect(flowButton?.flowSourceId).toBe("1690702985711558")
  })

  test("extractParameterInfos yields a string flowSourceId", () => {
    const flowParam = extractParameterInfos(components).find(
      (param) => param.buttonSubType === "flow",
    )
    expect(flowParam?.flowSourceId).toBe("1690702985711558")
  })
})

// ─── Step schema — channel (inboxId) persistence ─────────────────────────────
// The editor picks a WhatsApp channel via template.inboxId and filters templates
// by it. It must survive publish/reload, and flows saved before the field existed
// must still parse (default null) instead of dropping the channel.
describe("sendWaTemplateMessageStepSchema inboxId persistence", () => {
  const baseStep = {
    id: "11612473309626370",
    stepType: "sendWaTemplateMessage",
    template: {
      id: "11637903697428480",
      name: "get_feedback",
      language: "en",
      params: {},
    },
    buttons: [],
  }

  test("persists the selected channel inboxId", () => {
    const parsed = sendWaTemplateMessageStepSchema.parse({
      ...baseStep,
      template: { ...baseStep.template, inboxId: "11637902280048640" },
    })
    expect(parsed.template.inboxId).toBe("11637902280048640")
  })

  test("stays loadable (inboxId undefined) for flows saved before the field existed", () => {
    const parsed = sendWaTemplateMessageStepSchema.parse(baseStep)
    expect(parsed.template.inboxId).toBeUndefined()
  })
})
