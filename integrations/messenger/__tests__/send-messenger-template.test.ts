import type {
  ButtonStepProps,
  SendMessengerTemplateMessageStepSchema,
} from "@chatbotx.io/flow-config"
import { decodeButtonPayload } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import {
  buildMessengerTemplateComponents,
  buildMessengerTemplateSendRequest,
} from "../src/handlers/message/outgoing-message/send-messenger-template"
import { MESSENGER_MESSAGE_METADATA } from "../src/schema"

// Minimal props factory for buildMessengerTemplateSendRequest
function makeProps(
  overrides: Partial<{
    sourceId: string
    templateName: string
    templateLanguage: string
    params: SendMessengerTemplateMessageStepSchema["template"]["params"]
    parameterFormat: "POSITIONAL" | "NAMED"
    personaId?: string
    flowId?: string
    flowVersionId?: string
    buttons?: ButtonStepProps[]
    metadata?: Record<string, string>
  }> = {},
) {
  const {
    sourceId = "user-123",
    templateName = "order_update",
    templateLanguage = "en",
    params = {},
    parameterFormat = "POSITIONAL",
    personaId,
    flowId = "",
    flowVersionId,
    buttons = [],
    metadata,
  } = overrides

  return {
    ctx: {
      auth: {} as never,
      integrationDetail: personaId ? { personaId } : undefined,
    },
    data: {
      contact: { sourceId, id: "contact-1" },
      flowId,
      flowVersionId,
      metadata,
      step: {
        id: "step-1",
        nodeId: "node-1",
        stepType: "sendMessengerTemplateMessage" as const,
        buttons,
        template: {
          id: "tmpl-1",
          name: templateName,
          language: templateLanguage,
          parameterFormat,
          params,
        },
      },
    },
  } as Parameters<typeof buildMessengerTemplateSendRequest>[0]
}

// ─── buildMessengerTemplateComponents ────────────────────────────────────────

describe("buildMessengerTemplateComponents", () => {
  test("empty params → empty array", () => {
    expect(buildMessengerTemplateComponents({}, "POSITIONAL")).toEqual([])
  })

  describe("header", () => {
    test("text POSITIONAL — no parameter_name in output", () => {
      const components = buildMessengerTemplateComponents(
        { header: [{ type: "text", text: "Order ready" }] },
        "POSITIONAL",
      )
      expect(components).toHaveLength(1)
      expect(components[0]).toEqual({
        type: "header",
        parameters: [{ type: "text", text: "Order ready" }],
      })
      expect(
        (components[0].parameters[0] as Record<string, unknown>).parameter_name,
      ).toBeUndefined()
    })

    test("text NAMED — parameter_name included in output", () => {
      const components = buildMessengerTemplateComponents(
        {
          header: [
            { type: "text", text: "Hi {{name}}", parameter_name: "name" },
          ],
        },
        "NAMED",
      )
      expect(components[0].parameters[0]).toMatchObject({
        type: "text",
        text: "Hi {{name}}",
        parameter_name: "name",
      })
    })

    test("image type — produces no component (image fixed at template creation, not sent as param)", () => {
      const components = buildMessengerTemplateComponents(
        {
          header: [
            {
              type: "image",
              image: { link: "https://img.example.com/banner.jpg" },
            },
          ],
        },
        "POSITIONAL",
      )
      expect(components).toEqual([])
    })
  })

  describe("body", () => {
    test("POSITIONAL — no parameter_name", () => {
      const components = buildMessengerTemplateComponents(
        { body: [{ text: "Your order is confirmed" }] },
        "POSITIONAL",
      )
      expect(components[0]).toEqual({
        type: "body",
        parameters: [{ type: "text", text: "Your order is confirmed" }],
      })
    })

    test("NAMED — parameter_name included", () => {
      const components = buildMessengerTemplateComponents(
        { body: [{ text: "Hi John", parameter_name: "customer_name" }] },
        "NAMED",
      )
      expect(components[0].parameters[0]).toMatchObject({
        type: "text",
        text: "Hi John",
        parameter_name: "customer_name",
      })
    })

    test("multiple body params → multiple parameters in one component", () => {
      const components = buildMessengerTemplateComponents(
        { body: [{ text: "first" }, { text: "second" }] },
        "POSITIONAL",
      )
      expect(components[0].parameters).toHaveLength(2)
    })
  })

  describe("buttons", () => {
    test("quick_reply in params → NOT included (params.button only produces URL components)", () => {
      const components = buildMessengerTemplateComponents(
        { button: [{ sub_type: "quick_reply", payload: "confirm_order" }] },
        "POSITIONAL",
      )
      // quick_reply params are no longer turned into components; params.button is URL-only
      expect(components).toHaveLength(0)
    })

    test("url → URL type with text as url suffix", () => {
      const components = buildMessengerTemplateComponents(
        { button: [{ sub_type: "url", text: "12345" }] },
        "POSITIONAL",
      )
      expect(components[0]).toEqual({
        type: "buttons",
        parameters: [{ type: "URL", url: "12345" }],
      })
    })

    test("two url buttons in params → two URL components", () => {
      const components = buildMessengerTemplateComponents(
        {
          button: [
            { sub_type: "url", text: "suffix1" },
            { sub_type: "url", text: "suffix2" },
          ],
        },
        "POSITIONAL",
      )
      expect(components).toHaveLength(2)
      expect(components[0].parameters[0]).toMatchObject({
        type: "URL",
        url: "suffix1",
      })
      expect(components[1].parameters[0]).toMatchObject({
        type: "URL",
        url: "suffix2",
      })
    })

    test("POSTBACK from flowContext.flowButtons → POSTBACK type with encoded payload", () => {
      const flowButton: ButtonStepProps = {
        id: "1001",
        label: "Confirm",
        buttonType: null,
      }
      const components = buildMessengerTemplateComponents({}, "POSITIONAL", {
        flowId: "111",
        flowVersionId: "222",
        flowButtons: [flowButton],
      })
      expect(components).toHaveLength(1)
      expect(components[0].type).toBe("buttons")
      const param = components[0].parameters[0] as {
        type: string
        payload: string
      }
      expect(param.type).toBe("POSTBACK")
      const decoded = decodeButtonPayload(param.payload)
      expect(decoded).toMatchObject({
        flowId: "111",
        flowVersionId: "222",
        buttonId: "1001",
      })
    })

    test("two flow buttons → two POSTBACK components", () => {
      const buttons: ButtonStepProps[] = [
        { id: "2001", label: "Yes", buttonType: null },
        { id: "2002", label: "No", buttonType: null },
      ]
      const components = buildMessengerTemplateComponents({}, "POSITIONAL", {
        flowId: "333",
        flowButtons: buttons,
      })
      expect(components).toHaveLength(2)
      for (const comp of components) {
        const param = comp.parameters[0] as { type: string }
        expect(param.type).toBe("POSTBACK")
      }
    })

    test("broadcastId and sequenceStepId encoded into flow button payload", () => {
      const button: ButtonStepProps = {
        id: "3001",
        label: "Go",
        buttonType: null,
      }
      const components = buildMessengerTemplateComponents({}, "POSITIONAL", {
        flowId: "444",
        flowButtons: [button],
        metadata: { broadcastId: "55555", sequenceStepId: "66666" },
      })
      const param = components[0].parameters[0] as { payload: string }
      const decoded = decodeButtonPayload(param.payload)
      expect(decoded).toMatchObject({
        broadcastId: "55555",
        sequenceStepId: "66666",
      })
    })
  })

  test("all sections together — header + body + url button → three components in order", () => {
    const components = buildMessengerTemplateComponents(
      {
        header: [{ type: "text", text: "Title" }],
        body: [{ text: "Body text" }],
        button: [{ sub_type: "url", text: "suffix" }],
      },
      "POSITIONAL",
    )
    expect(components).toHaveLength(3)
    expect(components[0].type).toBe("header")
    expect(components[1].type).toBe("body")
    expect(components[2].type).toBe("buttons")
  })

  test("URL params then POSTBACK flow buttons → URL components before POSTBACK components", () => {
    const flowButton: ButtonStepProps = {
      id: "9001",
      label: "Confirm",
      buttonType: null,
    }
    const components = buildMessengerTemplateComponents(
      {
        header: [{ type: "text", text: "Hi" }],
        body: [{ text: "Your order" }],
        button: [{ sub_type: "url", text: "track" }],
      },
      "POSITIONAL",
      { flowId: "777", flowVersionId: "888", flowButtons: [flowButton] },
    )
    expect(components).toHaveLength(4)
    expect(components[0].type).toBe("header")
    expect(components[1].type).toBe("body")
    expect(components[2].parameters[0]).toMatchObject({ type: "URL" })
    expect(components[3].parameters[0]).toMatchObject({ type: "POSTBACK" })
  })
})

// ─── buildMessengerTemplateSendRequest ───────────────────────────────────────

describe("buildMessengerTemplateSendRequest", () => {
  test("recipient.id set from contact.sourceId", () => {
    const req = buildMessengerTemplateSendRequest(
      makeProps({ sourceId: "user-456" }),
    )
    expect(req.recipient).toEqual({ id: "user-456" })
  })

  test("messaging_type is UTILITY", () => {
    const req = buildMessengerTemplateSendRequest(makeProps())
    expect(req.messaging_type).toBe("UTILITY")
  })

  test("no tag field (UTILITY does not use MESSAGE_TAG)", () => {
    const req = buildMessengerTemplateSendRequest(makeProps())
    expect(req.tag).toBeUndefined()
  })

  test("no message_type field", () => {
    const req = buildMessengerTemplateSendRequest(makeProps())
    expect((req as Record<string, unknown>).message_type).toBeUndefined()
  })

  test("persona_id included when integrationDetail.personaId present", () => {
    const req = buildMessengerTemplateSendRequest(
      makeProps({ personaId: "persona-abc" }),
    )
    expect(req.persona_id).toBe("persona-abc")
  })

  test("persona_id undefined when integrationDetail absent", () => {
    const req = buildMessengerTemplateSendRequest(makeProps())
    expect(req.persona_id).toBeUndefined()
  })

  test("no message.attachment (utility uses message.template not message.attachment)", () => {
    const req = buildMessengerTemplateSendRequest(makeProps())
    expect(req.message?.attachment).toBeUndefined()
  })

  test("message.template.name and language.code from template", () => {
    const req = buildMessengerTemplateSendRequest(
      makeProps({ templateName: "delivery_update", templateLanguage: "vi" }),
    )
    const tmpl = req.message?.template as Record<string, unknown>
    expect(tmpl.name).toBe("delivery_update")
    expect((tmpl.language as { code: string }).code).toBe("vi")
  })

  test("message.metadata equals MESSENGER_MESSAGE_METADATA constant", () => {
    const req = buildMessengerTemplateSendRequest(makeProps())
    expect(req.message?.metadata).toBe(MESSENGER_MESSAGE_METADATA)
  })

  test("message.template.components matches buildMessengerTemplateComponents output", () => {
    const params = {
      header: [{ type: "text" as const, text: "Hi" }],
      body: [{ text: "Order confirmed" }],
    }
    const req = buildMessengerTemplateSendRequest(makeProps({ params }))
    const tmpl = req.message?.template as Record<string, unknown>
    const expected = buildMessengerTemplateComponents(params, "POSITIONAL")
    expect(tmpl.components).toEqual(expected)
  })

  test("3 body params produce correct components — regression for original error", () => {
    const req = buildMessengerTemplateSendRequest(
      makeProps({
        templateName: "address_update",
        templateLanguage: "vi",
        params: { body: [{ text: "1" }, { text: "2" }, { text: "3" }] },
        parameterFormat: "POSITIONAL",
      }),
    )
    const tmpl = req.message?.template as Record<string, unknown>
    expect(tmpl).toMatchObject({
      name: "address_update",
      language: { code: "vi" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: "1" },
            { type: "text", text: "2" },
            { type: "text", text: "3" },
          ],
        },
      ],
    })
  })

  test("step.buttons → POSTBACK component with encoded payload containing flowId and buttonId", () => {
    const button: ButtonStepProps = {
      id: "10001",
      label: "Confirm",
      buttonType: null,
    }
    const req = buildMessengerTemplateSendRequest(
      makeProps({
        flowId: "9900",
        flowVersionId: "500",
        buttons: [button],
      }),
    )
    const tmpl = req.message?.template as Record<string, unknown>
    const components = tmpl.components as Array<{
      type: string
      parameters: Array<{ type: string; payload?: string }>
    }>
    expect(components).toHaveLength(1)
    expect(components[0].type).toBe("buttons")
    const param = components[0].parameters[0]
    expect(param.type).toBe("POSTBACK")
    const decoded = decodeButtonPayload(param.payload ?? "")
    expect(decoded).toMatchObject({
      flowId: "9900",
      flowVersionId: "500",
      buttonId: "10001",
    })
  })

  test("URL params and step.buttons → URL then POSTBACK components", () => {
    const button: ButtonStepProps = {
      id: "20001",
      label: "Start",
      buttonType: null,
    }
    const req = buildMessengerTemplateSendRequest(
      makeProps({
        flowId: "4200",
        params: { button: [{ sub_type: "url", text: "order/123" }] },
        buttons: [button],
      }),
    )
    const tmpl = req.message?.template as Record<string, unknown>
    const components = tmpl.components as Array<{
      type: string
      parameters: Array<{ type: string }>
    }>
    expect(components).toHaveLength(2)
    expect(components[0].parameters[0].type).toBe("URL")
    expect(components[1].parameters[0].type).toBe("POSTBACK")
  })

  test("metadata broadcastId propagates into POSTBACK payload", () => {
    const button: ButtonStepProps = {
      id: "30001",
      label: "Yes",
      buttonType: null,
    }
    const req = buildMessengerTemplateSendRequest(
      makeProps({
        flowId: "8800",
        buttons: [button],
        metadata: { broadcastId: "55000" },
      }),
    )
    const tmpl = req.message?.template as Record<string, unknown>
    const components = tmpl.components as Array<{
      type: string
      parameters: Array<{ type: string; payload?: string }>
    }>
    const decoded = decodeButtonPayload(
      components[0].parameters[0].payload ?? "",
    )
    expect(decoded).toMatchObject({ broadcastId: "55000" })
  })
})
