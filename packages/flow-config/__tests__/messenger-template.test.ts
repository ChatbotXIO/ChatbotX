import { describe, expect, test } from "vitest"
import {
  extractMessengerFlowButtons,
  extractMessengerParameterInfos,
  extractMessengerTemplateParams,
  type MessengerTemplateComponent,
  mergeMessengerFlowButtonsWithExisting,
  messengerTemplateButtonParamSchema,
  sendMessengerTemplateMessageStepDefaultFn,
  sendMessengerTemplateMessageStepSchema,
} from "../src/steps/send-messenger-message-template"

// ─── extractMessengerTemplateParams ─────────────────────────────────────────

describe("extractMessengerTemplateParams", () => {
  test("empty components returns {}", () => {
    expect(extractMessengerTemplateParams([], "POSITIONAL")).toEqual({})
  })

  describe("HEADER TEXT", () => {
    const component: MessengerTemplateComponent = {
      type: "HEADER",
      format: "TEXT",
      text: "Hello {{1}}",
    }

    test("POSITIONAL — no parameter_name", () => {
      const result = extractMessengerTemplateParams([component], "POSITIONAL")
      expect(result.header).toEqual([{ type: "text", text: "" }])
    })

    test("NAMED — includes parameter_name", () => {
      const namedComponent: MessengerTemplateComponent = {
        type: "HEADER",
        format: "TEXT",
        text: "Hello {{name}}",
      }
      const result = extractMessengerTemplateParams([namedComponent], "NAMED")
      expect(result.header).toEqual([
        { type: "text", text: "", parameter_name: "name" },
      ])
    })

    test("no variables in text — header stays undefined", () => {
      const noVars: MessengerTemplateComponent = {
        type: "HEADER",
        format: "TEXT",
        text: "Static header",
      }
      const result = extractMessengerTemplateParams([noVars], "POSITIONAL")
      expect(result.header).toBeUndefined()
    })
  })

  describe("HEADER IMAGE", () => {
    test("returns no header params — image is fixed at template creation, not parameterized at send-time", () => {
      const component: MessengerTemplateComponent = {
        type: "HEADER",
        format: "IMAGE",
      }
      expect(
        extractMessengerTemplateParams([component], "POSITIONAL").header,
      ).toBeUndefined()
      expect(
        extractMessengerTemplateParams([component], "NAMED").header,
      ).toBeUndefined()
    })
  })

  describe("BODY", () => {
    test("POSITIONAL — two vars → two empty text items, no parameter_name", () => {
      const component: MessengerTemplateComponent = {
        type: "BODY",
        text: "Hi {{1}} and {{2}}",
      }
      const result = extractMessengerTemplateParams([component], "POSITIONAL")
      expect(result.body).toEqual([{ text: "" }, { text: "" }])
    })

    test("NAMED — each item has parameter_name", () => {
      const component: MessengerTemplateComponent = {
        type: "BODY",
        text: "Hi {{first_name}} your order {{order_id}} is ready",
      }
      const result = extractMessengerTemplateParams([component], "NAMED")
      expect(result.body).toEqual([
        { text: "", parameter_name: "first_name" },
        { text: "", parameter_name: "order_id" },
      ])
    })

    test("body with no variables — body stays undefined", () => {
      const component: MessengerTemplateComponent = {
        type: "BODY",
        text: "Static body",
      }
      expect(
        extractMessengerTemplateParams([component], "POSITIONAL").body,
      ).toBeUndefined()
    })
  })

  describe("BUTTONS", () => {
    test("URL button with {{1}} → sub_type url", () => {
      const component: MessengerTemplateComponent = {
        type: "BUTTONS",
        buttons: [
          { type: "URL", text: "Track", url: "https://example.com/{{1}}" },
        ],
      }
      const result = extractMessengerTemplateParams([component], "POSITIONAL")
      expect(result.button).toEqual([{ sub_type: "url", index: 0, text: "" }])
    })

    test("URL button WITHOUT {{1}} in url — uses fixed url as send param", () => {
      const component: MessengerTemplateComponent = {
        type: "BUTTONS",
        buttons: [
          { type: "URL", text: "Go", url: "https://example.com/fixed" },
        ],
      }
      const result = extractMessengerTemplateParams([component], "POSITIONAL")
      expect(result.button).toEqual([
        { sub_type: "url", index: 0, text: "https://example.com/fixed" },
      ])
    })

    test("POSTBACK with fixed payload (no {{) — not added", () => {
      const component: MessengerTemplateComponent = {
        type: "BUTTONS",
        buttons: [{ type: "POSTBACK", text: "Confirm", payload: "CONFIRM" }],
      }
      const result = extractMessengerTemplateParams([component], "POSITIONAL")
      expect(result.button).toBeUndefined()
    })

    test("POSTBACK with {{N}} in payload — not added (becomes a flow button, not a param)", () => {
      const component: MessengerTemplateComponent = {
        type: "BUTTONS",
        buttons: [
          { type: "POSTBACK", text: "Track", payload: "order_id_{{1}}" },
        ],
      }
      const result = extractMessengerTemplateParams([component], "POSITIONAL")
      expect(result.button).toBeUndefined()
    })

    test("QUICK_REPLY with fixed payload — not added", () => {
      const component: MessengerTemplateComponent = {
        type: "BUTTONS",
        buttons: [{ type: "QUICK_REPLY", text: "Yes", payload: "YES" }],
      }
      const result = extractMessengerTemplateParams([component], "POSITIONAL")
      expect(result.button).toBeUndefined()
    })

    test("mixed URL + POSTBACK buttons — only URL button produces a param", () => {
      const component: MessengerTemplateComponent = {
        type: "BUTTONS",
        buttons: [
          { type: "POSTBACK", text: "Confirm", payload: "CONFIRM" },
          {
            type: "URL",
            text: "Track",
            url: "https://example.com/{{1}}",
          },
        ],
      }
      const result = extractMessengerTemplateParams([component], "POSITIONAL")
      expect(result.button).toHaveLength(1)
      expect(result.button?.[0].sub_type).toBe("url")
      expect(result.button?.[0].index).toBe(1)
    })

    test("POSTBACK + PHONE_NUMBER + static URL — phone and URL produce send params", () => {
      const component: MessengerTemplateComponent = {
        type: "BUTTONS",
        buttons: [
          { type: "POSTBACK", text: "Detail", payload: "{{1}}" },
          {
            type: "PHONE_NUMBER",
            text: "Phone",
            phone_number: "+84349566551",
          },
          { type: "URL", text: "Visit website", url: "https://ahachat.com/" },
        ],
      }
      const result = extractMessengerTemplateParams([component], "POSITIONAL")
      expect(result.button).toEqual([
        { sub_type: "phone_number", index: 1 },
        { sub_type: "url", index: 2, text: "https://ahachat.com/" },
      ])
    })
  })
})

// ─── extractMessengerParameterInfos ─────────────────────────────────────────

describe("extractMessengerParameterInfos", () => {
  test("empty components returns []", () => {
    expect(extractMessengerParameterInfos([], "POSITIONAL")).toEqual([])
  })

  describe("HEADER TEXT", () => {
    test("POSITIONAL — paramName is positional number string", () => {
      const component: MessengerTemplateComponent = {
        type: "HEADER",
        format: "TEXT",
        text: "Hello {{foo}}",
      }
      const result = extractMessengerParameterInfos([component], "POSITIONAL")
      expect(result).toEqual([
        { type: "header", index: 0, paramName: "1", format: "text" },
      ])
    })

    test("NAMED — paramName is raw variable name", () => {
      const component: MessengerTemplateComponent = {
        type: "HEADER",
        format: "TEXT",
        text: "Hello {{customer_name}}",
      }
      const result = extractMessengerParameterInfos([component], "NAMED")
      expect(result).toEqual([
        {
          type: "header",
          index: 0,
          paramName: "customer_name",
          format: "text",
        },
      ])
    })
  })

  describe("HEADER IMAGE", () => {
    test("returns empty array — image fixed at template creation, no send-time parameter needed", () => {
      const component: MessengerTemplateComponent = {
        type: "HEADER",
        format: "IMAGE",
      }
      const result = extractMessengerParameterInfos([component], "POSITIONAL")
      expect(result).toEqual([])
    })
  })

  describe("BODY", () => {
    test("two vars POSITIONAL → indexes 0,1; paramNames 1,2", () => {
      const component: MessengerTemplateComponent = {
        type: "BODY",
        text: "Hi {{1}} your order {{2}} is confirmed",
      }
      const result = extractMessengerParameterInfos([component], "POSITIONAL")
      expect(result).toEqual([
        { type: "body", index: 0, paramName: "1" },
        { type: "body", index: 1, paramName: "2" },
      ])
    })

    test("two vars NAMED → paramNames are raw variable names", () => {
      const component: MessengerTemplateComponent = {
        type: "BODY",
        text: "Hi {{first_name}} your order {{order_id}} confirmed",
      }
      const result = extractMessengerParameterInfos([component], "NAMED")
      expect(result).toEqual([
        { type: "body", index: 0, paramName: "first_name" },
        { type: "body", index: 1, paramName: "order_id" },
      ])
    })
  })

  describe("BUTTONS", () => {
    test("URL button with {{1}} → buttonSubType url", () => {
      const component: MessengerTemplateComponent = {
        type: "BUTTONS",
        buttons: [{ type: "URL", text: "Track", url: "https://x.com/{{1}}" }],
      }
      const result = extractMessengerParameterInfos([component], "POSITIONAL")
      expect(result).toEqual([
        {
          type: "button",
          index: 0,
          paramName: "1",
          buttonIndex: 0,
          buttonSubType: "url",
        },
      ])
    })

    test("POSTBACK with fixed payload (no {{) → empty result", () => {
      const component: MessengerTemplateComponent = {
        type: "BUTTONS",
        buttons: [{ type: "POSTBACK", text: "Confirm", payload: "CONFIRM" }],
      }
      const result = extractMessengerParameterInfos([component], "POSITIONAL")
      expect(result).toEqual([])
    })

    test("POSTBACK with {{N}} payload → empty result (becomes flow button, not ParameterInfo)", () => {
      const component: MessengerTemplateComponent = {
        type: "BUTTONS",
        buttons: [
          { type: "POSTBACK", text: "Track", payload: "order_id_{{1}}" },
        ],
      }
      const result = extractMessengerParameterInfos([component], "POSITIONAL")
      expect(result).toEqual([])
    })

    test("QUICK_REPLY with fixed payload → no param entry", () => {
      const component: MessengerTemplateComponent = {
        type: "BUTTONS",
        buttons: [{ type: "QUICK_REPLY", text: "Yes", payload: "YES" }],
      }
      const result = extractMessengerParameterInfos([component], "POSITIONAL")
      expect(result).toEqual([])
    })
  })
})

// ─── extractMessengerFlowButtons ────────────────────────────────────────────

describe("extractMessengerFlowButtons", () => {
  test("empty components returns []", () => {
    expect(extractMessengerFlowButtons([])).toEqual([])
  })

  test("POSTBACK with {{N}} in payload → one ButtonStepProps with label = button.text, buttonType null", () => {
    const component: MessengerTemplateComponent = {
      type: "BUTTONS",
      buttons: [
        { type: "POSTBACK", text: "Confirm", payload: "order_id_{{1}}" },
      ],
    }
    const result = extractMessengerFlowButtons([component])
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe("Confirm")
    expect(result[0].buttonType).toBeNull()
    expect(result[0].beforeStep).toBeNull()
    expect(result[0].steps).toEqual([])
    expect(typeof result[0].id).toBe("string")
    expect(result[0].id.length).toBeGreaterThan(0)
  })

  test("QUICK_REPLY with {{N}} in payload → one ButtonStepProps with label = button.text", () => {
    const component: MessengerTemplateComponent = {
      type: "BUTTONS",
      buttons: [{ type: "QUICK_REPLY", text: "Yes", payload: "confirm_{{1}}" }],
    }
    const result = extractMessengerFlowButtons([component])
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe("Yes")
    expect(result[0].buttonType).toBeNull()
  })

  test("POSTBACK without {{}} in payload — excluded", () => {
    const component: MessengerTemplateComponent = {
      type: "BUTTONS",
      buttons: [{ type: "POSTBACK", text: "Confirm", payload: "CONFIRM" }],
    }
    const result = extractMessengerFlowButtons([component])
    expect(result).toHaveLength(0)
  })

  test("URL button — excluded (URL buttons are params, not flow buttons)", () => {
    const component: MessengerTemplateComponent = {
      type: "BUTTONS",
      buttons: [
        { type: "URL", text: "Track", url: "https://example.com/{{1}}" },
      ],
    }
    const result = extractMessengerFlowButtons([component])
    expect(result).toHaveLength(0)
  })

  test("mixed: POSTBACK with {{ + POSTBACK without {{ + URL → only POSTBACK with {{ included", () => {
    const component: MessengerTemplateComponent = {
      type: "BUTTONS",
      buttons: [
        { type: "POSTBACK", text: "Routable", payload: "track_{{1}}" },
        { type: "POSTBACK", text: "Fixed", payload: "FIXED" },
        { type: "URL", text: "Link", url: "https://example.com/{{1}}" },
      ],
    }
    const result = extractMessengerFlowButtons([component])
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe("Routable")
  })

  test("multiple POSTBACK buttons with {{ → one ButtonStepProps per button", () => {
    const component: MessengerTemplateComponent = {
      type: "BUTTONS",
      buttons: [
        { type: "POSTBACK", text: "Accept", payload: "accept_{{1}}" },
        { type: "POSTBACK", text: "Decline", payload: "decline_{{1}}" },
      ],
    }
    const result = extractMessengerFlowButtons([component])
    expect(result).toHaveLength(2)
    expect(result[0].label).toBe("Accept")
    expect(result[1].label).toBe("Decline")
  })

  test("two calls produce different ids per button", () => {
    const component: MessengerTemplateComponent = {
      type: "BUTTONS",
      buttons: [{ type: "POSTBACK", text: "Confirm", payload: "c_{{1}}" }],
    }
    const [a] = extractMessengerFlowButtons([component])
    const [b] = extractMessengerFlowButtons([component])
    expect(a.id).not.toBe(b.id)
  })

  test("button.text undefined → label is empty string", () => {
    const component: MessengerTemplateComponent = {
      type: "BUTTONS",
      buttons: [
        {
          type: "POSTBACK",
          text: "",
          payload: "order_{{1}}",
        },
      ],
    }
    const result = extractMessengerFlowButtons([component])
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe("")
  })

  test("non-BUTTONS components are ignored", () => {
    const components: MessengerTemplateComponent[] = [
      { type: "HEADER", format: "TEXT", text: "Hello {{1}}" },
      { type: "BODY", text: "Hi {{1}} your order is ready" },
    ]
    const result = extractMessengerFlowButtons(components)
    expect(result).toHaveLength(0)
  })
})

// ─── sendMessengerTemplateMessageStepSchema ──────────────────────────────────

describe("sendMessengerTemplateMessageStepSchema", () => {
  const base = {
    id: "1",
    stepType: "sendMessengerTemplateMessage" as const,
    nodeId: "node-1",
    template: {
      id: "tmpl-1",
      name: "order_confirm",
      language: "en",
      params: {},
    },
  }

  test("parameterFormat defaults to POSITIONAL", () => {
    const result = sendMessengerTemplateMessageStepSchema.parse({
      ...base,
      buttons: [],
    })
    expect(result.template.parameterFormat).toBe("POSITIONAL")
  })

  test("empty buttons stay empty (linear send — no Delivered/Failed branching)", () => {
    const result = sendMessengerTemplateMessageStepSchema.parse({
      ...base,
      buttons: [],
    })
    expect(result.buttons).toHaveLength(0)
  })

  test("buttons default to [] when omitted", () => {
    const { buttons: _omit, ...withoutButtons } = { ...base, buttons: [] }
    const result = sendMessengerTemplateMessageStepSchema.parse(withoutButtons)
    expect(result.buttons).toEqual([])
  })

  test("non-empty buttons are preserved", () => {
    const result = sendMessengerTemplateMessageStepSchema.parse({
      ...base,
      buttons: [
        {
          id: "1",
          label: "Accept",
          steps: [],
          beforeStep: null,
          buttonType: null,
        },
      ],
    })
    expect(result.buttons).toHaveLength(1)
    expect(result.buttons[0]).toMatchObject({ id: "1", label: "Accept" })
  })

  test("empty template.id (whitespace) → parse fails", () => {
    const result = sendMessengerTemplateMessageStepSchema.safeParse({
      ...base,
      template: { ...base.template, id: "   " },
      buttons: [],
    })
    expect(result.success).toBe(false)
  })
})

// ─── sendMessengerTemplateMessageStepDefaultFn ───────────────────────────────

describe("sendMessengerTemplateMessageStepDefaultFn", () => {
  test("stepType is sendMessengerTemplateMessage", () => {
    const step = sendMessengerTemplateMessageStepDefaultFn()
    expect(step.stepType).toBe("sendMessengerTemplateMessage")
  })

  test("parameterFormat defaults to POSITIONAL", () => {
    const step = sendMessengerTemplateMessageStepDefaultFn()
    expect(step.template.parameterFormat).toBe("POSITIONAL")
  })

  test("buttons default to empty (linear send, no branching)", () => {
    const step = sendMessengerTemplateMessageStepDefaultFn()
    expect(step.buttons).toHaveLength(0)
  })

  test("id is always generated (non-empty string)", () => {
    const step = sendMessengerTemplateMessageStepDefaultFn()
    expect(typeof step.id).toBe("string")
    expect(step.id.length).toBeGreaterThan(0)
  })

  test("two calls produce different ids", () => {
    const a = sendMessengerTemplateMessageStepDefaultFn()
    const b = sendMessengerTemplateMessageStepDefaultFn()
    expect(a.id).not.toBe(b.id)
  })

  test("props override template fields", () => {
    const step = sendMessengerTemplateMessageStepDefaultFn({
      template: {
        id: "tmpl-99",
        name: "custom",
        language: "vi",
        parameterFormat: "NAMED",
        params: { body: [{ text: "hello" }] },
      },
    })
    expect(step.template.id).toBe("tmpl-99")
    expect(step.template.parameterFormat).toBe("NAMED")
  })
})

describe("sendMessengerTemplateMessageStepSchema — inboxId/integrationMessengerId", () => {
  test("preserves inboxId through schema parse", () => {
    const step = sendMessengerTemplateMessageStepDefaultFn()
    const withMeta = {
      ...step,
      template: { ...step.template, id: "tmpl-1", inboxId: "inbox-123" },
    }

    const parsed = sendMessengerTemplateMessageStepSchema.safeParse(withMeta)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect((parsed.data.template as Record<string, unknown>).inboxId).toBe(
        "inbox-123",
      )
    }
  })

  test("preserves integrationMessengerId through schema parse", () => {
    const step = sendMessengerTemplateMessageStepDefaultFn()
    const withMeta = {
      ...step,
      template: {
        ...step.template,
        id: "tmpl-1",
        integrationMessengerId: "intg-456",
      },
    }

    const parsed = sendMessengerTemplateMessageStepSchema.safeParse(withMeta)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(
        (parsed.data.template as Record<string, unknown>)
          .integrationMessengerId,
      ).toBe("intg-456")
    }
  })

  test("messengerTemplateButtonParamSchema rejects sub_type quick_reply", () => {
    const result = messengerTemplateButtonParamSchema.safeParse({
      sub_type: "quick_reply",
    })
    expect(result.success).toBe(false)
  })
})

describe("mergeMessengerFlowButtonsWithExisting", () => {
  test("keeps existing button id and routing config by index while updating label", () => {
    const result = mergeMessengerFlowButtonsWithExisting(
      [
        {
          id: "new-button",
          label: "New template label",
          buttonType: null,
          beforeStep: null,
          steps: [],
        },
      ],
      [
        {
          id: "connected-button",
          label: "Old template label",
          buttonType: "startAnotherNode",
          beforeStep: {
            id: "before-step",
            stepType: "startAnotherNode",
            nodeId: "target-node",
            viewOnly: true,
          },
          steps: [],
        },
      ],
    )

    expect(result).toEqual([
      {
        id: "connected-button",
        label: "New template label",
        buttonType: "startAnotherNode",
        beforeStep: {
          id: "before-step",
          stepType: "startAnotherNode",
          nodeId: "target-node",
          viewOnly: true,
        },
        steps: [],
      },
    ])
  })

  test("uses new template button when there is no existing button at that index", () => {
    const result = mergeMessengerFlowButtonsWithExisting([
      {
        id: "new-button",
        label: "New template label",
        buttonType: null,
        beforeStep: null,
        steps: [],
      },
    ])

    expect(result[0]).toMatchObject({
      id: "new-button",
      label: "New template label",
      buttonType: null,
    })
  })
})
