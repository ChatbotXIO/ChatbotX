import type {
  ButtonStepProps,
  MessengerTemplateComponent,
  SendMessengerTemplateMessageStepSchema,
} from "@chatbotx.io/flow-config"
import {
  decodeButtonPayload,
  extractMessengerTemplateParams,
} from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { sendFlowStep } from "../src/handlers/message/outgoing-message"
import {
  buildMessengerTemplateComponents,
  buildMessengerTemplateSendRequest,
} from "../src/handlers/message/outgoing-message/send-messenger-template"
import { MESSENGER_MESSAGE_METADATA } from "../src/schema"

const { mockSendPageMessage } = vi.hoisted(() => ({
  mockSendPageMessage: vi.fn(),
}))

vi.mock("../src/apis/message", () => ({
  sendMessage: mockSendPageMessage,
}))

// Minimal props factory for buildMessengerTemplateSendRequest
function makeProps(
  overrides: Partial<{
    lastIncomingMessageAt: Date | string | null
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
    sendFrom?: "inbox"
  }> = {},
) {
  const {
    lastIncomingMessageAt,
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
    sendFrom,
  } = overrides

  return {
    ctx: {
      auth: {} as never,
      integrationDetail: personaId ? { personaId } : undefined,
    },
    data: {
      contact: { sourceId, id: "contact-1", lastIncomingMessageAt },
      flowId,
      flowVersionId,
      metadata,
      sendFrom,
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

beforeEach(() => {
  vi.clearAllMocks()
  mockSendPageMessage.mockResolvedValue({ recipient_id: "user-123" })
})

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

    // Regression for (#100 - 1893029) "Missing one or more header params": a
    // "text and image" template (IMAGE header whose text is "{{1}}") must send
    // the header text variable; only the image is fixed at creation.
    test("image header with a text variable — sends a header text parameter", () => {
      const templateComponents: MessengerTemplateComponent[] = [
        {
          type: "HEADER",
          format: "IMAGE",
          text: "{{1}}",
          example: {
            header_text: ["The goods is imported"],
            header_handle: ["https://scontent.example.com/header.png"],
          },
        },
        {
          type: "BODY",
          text: "{{1}}\n\n🔴{{2}}\n🔴{{3}}\n🔴{{4}}\n🔴{{5}}",
        },
      ]
      const extracted = extractMessengerTemplateParams(
        templateComponents,
        "POSITIONAL",
      )
      const params = {
        header: extracted.header?.map((param) => ({
          ...param,
          text: "Header value",
        })),
        body: extracted.body?.map((param, idx) => ({
          ...param,
          text: `Body ${idx + 1}`,
        })),
      }

      const components = buildMessengerTemplateComponents(params, "POSITIONAL")

      expect(components[0]).toEqual({
        type: "header",
        parameters: [{ type: "text", text: "Header value" }],
      })
      expect(components[1].type).toBe("body")
      expect(components[1].parameters).toHaveLength(5)
    })
  })

  // Mirrors Meta's documented NAMED template: the URL button keeps a named
  // suffix placeholder, and the send-time parameter is only the suffix value.
  test("NAMED template URL button {{url_suffix}} — sends only the suffix value", () => {
    const templateComponents: MessengerTemplateComponent[] = [
      {
        type: "BODY",
        text: "Good news! Your order #{{order_id}} is on its way.",
      },
      {
        type: "BUTTONS",
        buttons: [
          {
            type: "URL",
            text: "Track Order",
            url: "http://www.example.com/orders/{{url_suffix}}",
          },
        ],
      },
    ]
    const extracted = extractMessengerTemplateParams(
      templateComponents,
      "NAMED",
    )
    const params = {
      body: extracted.body?.map((param) => ({ ...param, text: "566701" })),
      button: extracted.button?.map((param) => ({ ...param, text: "1234" })),
    }

    const components = buildMessengerTemplateComponents(params, "NAMED")

    expect(components).toEqual([
      {
        type: "body",
        parameters: [
          { type: "text", text: "566701", parameter_name: "order_id" },
        ],
      },
      { type: "buttons", parameters: [{ type: "URL", url: "1234" }] },
    ])
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

    test("two url buttons in params → one buttons component with two URL parameters", () => {
      const components = buildMessengerTemplateComponents(
        {
          button: [
            { sub_type: "url", text: "suffix1" },
            { sub_type: "url", text: "suffix2" },
          ],
        },
        "POSITIONAL",
      )
      expect(components).toHaveLength(1)
      expect(components[0].parameters[0]).toMatchObject({
        type: "URL",
        url: "suffix1",
      })
      expect(components[0].parameters[1]).toMatchObject({
        type: "URL",
        url: "suffix2",
      })
    })

    test("phone_number param → PHONE_NUMBER parameter", () => {
      const components = buildMessengerTemplateComponents(
        { button: [{ sub_type: "phone_number", index: 0 }] },
        "POSITIONAL",
      )
      expect(components).toEqual([
        {
          type: "buttons",
          parameters: [{ type: "PHONE_NUMBER" }],
        },
      ])
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

    test("two flow buttons → one buttons component with two POSTBACK parameters", () => {
      const buttons: ButtonStepProps[] = [
        { id: "2001", label: "Yes", buttonType: null },
        { id: "2002", label: "No", buttonType: null },
      ]
      const components = buildMessengerTemplateComponents({}, "POSITIONAL", {
        flowId: "333",
        flowButtons: buttons,
      })
      expect(components).toHaveLength(1)
      expect(components[0].parameters).toHaveLength(2)
      expect(components[0].parameters[0]).toMatchObject({ type: "POSTBACK" })
      expect(components[0].parameters[1]).toMatchObject({ type: "POSTBACK" })
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

  test("URL params then POSTBACK flow buttons → button parameters ordered by index", () => {
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
    expect(components).toHaveLength(3)
    expect(components[0].type).toBe("header")
    expect(components[1].type).toBe("body")
    expect(components[2].parameters[0]).toMatchObject({ type: "URL" })
    expect(components[2].parameters[1]).toMatchObject({ type: "POSTBACK" })
  })

  test("POSTBACK + PHONE_NUMBER + URL keeps template button order", () => {
    const button: ButtonStepProps = {
      id: "9002",
      label: "Details",
      buttonType: null,
    }
    const components = buildMessengerTemplateComponents(
      {
        button: [
          { sub_type: "phone_number", index: 1 },
          { sub_type: "url", index: 2, text: "https://ahachat.com/" },
        ],
      },
      "POSITIONAL",
      { flowId: "777", flowVersionId: "888", flowButtons: [button] },
    )
    expect(components).toHaveLength(1)
    expect(components[0].parameters).toEqual([
      expect.objectContaining({ type: "POSTBACK" }),
      { type: "PHONE_NUMBER" },
      { type: "URL", url: "https://ahachat.com/" },
    ])
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

  test("URL params and step.buttons → one buttons component with URL then POSTBACK parameters", () => {
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
    expect(components).toHaveLength(1)
    expect(components[0].parameters[0].type).toBe("URL")
    expect(components[0].parameters[1].type).toBe("POSTBACK")
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

describe("sendFlowStep", () => {
  test("sends Messenger template as UTILITY even when inbox send is outside the 7-day human-agent window", async () => {
    await expect(
      sendFlowStep(
        makeProps({
          lastIncomingMessageAt: "2026-06-01T00:00:00.000Z",
          sendFrom: "inbox",
        }),
      ),
    ).resolves.toEqual({ messageIds: [], sentCount: 1 })

    expect(mockSendPageMessage).toHaveBeenCalledTimes(1)
    const [, payload] = mockSendPageMessage.mock.calls[0]
    expect(payload).toMatchObject({ messaging_type: "UTILITY" })
    expect(payload).not.toHaveProperty("tag")
  })
})
