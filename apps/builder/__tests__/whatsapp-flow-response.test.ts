// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const findByIdWithUrls = vi.fn()
const findContactInbox = vi.fn()
const resolveSentWhatsappFlow = vi.fn()
const findIntegrationById = vi.fn()
const findIntegrationByInbox = vi.fn()
const runAction = vi.fn()
const loggerWarn = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  messageService: { findByIdWithUrls },
  contactInboxService: { findBy: findContactInbox },
  resolveSentWhatsappFlow,
  integrationWhatsappService: {
    findByIdForWorkspace: findIntegrationById,
    findByInboxIdForWorkspace: findIntegrationByInbox,
  },
}))
vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: (message: string) =>
    Object.assign(new Error(message), { code: "NOT_FOUND" }),
}))
vi.mock(
  "@/features/integration-whatsapp/flows/lib/whatsapp-flow-operations",
  () => ({ buildWhatsappContext: vi.fn(async () => ({ ctx: true })) }),
)
vi.mock("@/integration", () => ({
  integrations: { whatsapp: { runAction } },
}))
vi.mock("@/lib/log", () => ({ logger: { warn: loggerWarn } }))

const { buildWhatsappFlowResponseFields } = await import(
  "../src/features/messages/lib/build-whatsapp-flow-response-fields"
)
const { getWhatsappFlowResponseView } = await import(
  "../src/features/messages/lib/get-whatsapp-flow-response"
)

const label = (
  key: string,
  text: string,
  options: Record<string, string> = {},
) => ({ key, label: text, options, labelled: true })

describe("buildWhatsappFlowResponseFields", () => {
  test("pairs answers with labels in the Flow's order and drops flow_token", () => {
    const result = buildWhatsappFlowResponseFields(
      { flow_token: "tok", phone: "0901", name: "An" },
      [label("name", "Full name"), label("phone", "Phone")],
    )

    expect(result).toEqual({
      fields: [
        { key: "name", label: "Full name", kind: "text", value: "An" },
        { key: "phone", label: "Phone", kind: "text", value: "0901" },
      ],
      labelSource: "whatsappFlow",
    })
  })

  test("maps single and multi-select option ids to titles", () => {
    const options = { "0_basic": "Basic", "1_pro": "Pro" }
    const { fields } = buildWhatsappFlowResponseFields(
      { plan: "1_pro", addons: ["0_basic", "1_pro", "unknown"] },
      [label("plan", "Plan", options), label("addons", "Add-ons", options)],
    )

    expect(fields).toEqual([
      { key: "plan", label: "Plan", kind: "text", value: "Pro" },
      {
        key: "addons",
        label: "Add-ons",
        kind: "list",
        value: ["Basic", "Pro", "unknown"],
      },
    ])
  })

  test("reads opt-ins, dates, numbers and empty answers", () => {
    const { fields } = buildWhatsappFlowResponseFields(
      { agree: true, birthday: "2026-10-11", age: 30, note: null },
      [],
    )

    expect(fields).toEqual([
      { key: "agree", label: "Agree", kind: "boolean", value: true },
      { key: "birthday", label: "Birthday", kind: "text", value: "2026-10-11" },
      { key: "age", label: "Age", kind: "text", value: "30" },
      { key: "note", label: "Note", kind: "text", value: "" },
    ])
  })

  test("reads PhotoPicker/DocumentPicker files as Meta sends them", () => {
    const { fields } = buildWhatsappFlowResponseFields(
      {
        photos: [
          {
            file_name: "IMG_1.jpg",
            mime_type: "image/jpeg",
            sha256: "abc",
            id: "media-1",
          },
          { file_name: "scan.pdf" },
        ],
      },
      [label("photos", "Photos")],
    )

    expect(fields).toEqual([
      {
        key: "photos",
        label: "Photos",
        kind: "files",
        value: [
          { fileName: "IMG_1.jpg", mimeType: "image/jpeg", mediaId: "media-1" },
          { fileName: "scan.pdf", mimeType: null, mediaId: null },
        ],
      },
    ])
  })

  test("shows any other shape as JSON instead of breaking", () => {
    const { fields } = buildWhatsappFlowResponseFields(
      { address: { city: "HCM" }, mixed: [1, { a: 1 }] },
      [],
    )

    expect(fields).toEqual([
      {
        key: "address",
        label: "Address",
        kind: "json",
        value: '{"city":"HCM"}',
      },
      { key: "mixed", label: "Mixed", kind: "json", value: '[1,{"a":1}]' },
    ])
  })

  test("humanizes unlabelled keys, listed after labelled ones", () => {
    const result = buildWhatsappFlowResponseFields(
      { source_channel: "ads", name: "An" },
      [label("name", "Full name")],
    )

    expect(result.fields.map((field) => [field.key, field.label])).toEqual([
      ["name", "Full name"],
      ["source_channel", "Source channel"],
    ])
  })

  test("reports a fallback when no label matched", () => {
    expect(
      buildWhatsappFlowResponseFields({ text_input_2: "x" }, [
        {
          key: "text_input_2",
          label: "Text input 2",
          options: {},
          labelled: false,
        },
      ]).labelSource,
    ).toBe("fallback")
    expect(buildWhatsappFlowResponseFields({ a: "x" }, []).labelSource).toBe(
      "fallback",
    )
  })
})

describe("getWhatsappFlowResponseView", () => {
  const props = {
    workspaceId: "ws-1",
    conversationId: "conv-1",
    messageId: "msg-1",
    createdAt: new Date("2026-10-01T00:00:00Z"),
  }

  const flowMessage = (contentAttributes: unknown) => ({
    id: "msg-1",
    conversationId: "conv-1",
    contactInboxId: "ci-1",
    contentAttributes,
  })

  const flowResponseAttributes = {
    type: "whatsapp_flow_response",
    name: "flow",
    flowResponse: { flow_token: "tok", name_input: "An" },
    flowToken: "tok",
    decoded: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    findByIdWithUrls.mockResolvedValue(flowMessage(flowResponseAttributes))
    findContactInbox.mockResolvedValue({ id: "ci-1", inboxId: "inbox-1" })
    resolveSentWhatsappFlow.mockResolvedValue({ flowSourceId: "meta-flow-1" })
    findIntegrationByInbox.mockResolvedValue({ id: "wa-1" })
    runAction.mockResolvedValue([label("name_input", "Full name")])
  })

  test("labels the answers from the Flow that was sent", async () => {
    const view = await getWhatsappFlowResponseView(props)

    expect(resolveSentWhatsappFlow).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      flowToken: "tok",
    })
    expect(runAction).toHaveBeenCalledWith("getFlowResponseFields", {
      ctx: { ctx: true },
      params: { flowSourceId: "meta-flow-1" },
    })
    expect(view).toEqual({
      fields: [
        { key: "name_input", label: "Full name", kind: "text", value: "An" },
      ],
      labelSource: "whatsappFlow",
    })
  })

  test("uses the broadcast's own number when the template names one", async () => {
    resolveSentWhatsappFlow.mockResolvedValue({
      flowSourceId: "meta-flow-1",
      integrationWhatsappId: "wa-broadcast",
    })
    findIntegrationById.mockResolvedValue({ id: "wa-broadcast" })

    await getWhatsappFlowResponseView(props)

    expect(findIntegrationById).toHaveBeenCalledWith({
      id: "wa-broadcast",
      workspaceId: "ws-1",
    })
    expect(findIntegrationByInbox).not.toHaveBeenCalled()
  })

  test("falls back to humanized keys when the Flow cannot be identified", async () => {
    resolveSentWhatsappFlow.mockResolvedValue(null)

    const view = await getWhatsappFlowResponseView(props)

    expect(runAction).not.toHaveBeenCalled()
    expect(view.labelSource).toBe("fallback")
    expect(view.fields[0]).toMatchObject({ label: "Name input", value: "An" })
  })

  test("falls back when Meta or the lookup fails, without failing the request", async () => {
    findIntegrationByInbox.mockRejectedValue(new Error("no integration"))

    const view = await getWhatsappFlowResponseView(props)

    expect(view.labelSource).toBe("fallback")
    expect(loggerWarn).toHaveBeenCalled()
  })

  test("reads the token from the response when the entity has none", async () => {
    findByIdWithUrls.mockResolvedValue(
      flowMessage({ ...flowResponseAttributes, flowToken: null }),
    )

    await getWhatsappFlowResponseView(props)

    expect(resolveSentWhatsappFlow).toHaveBeenCalledWith(
      expect.objectContaining({ flowToken: "tok" }),
    )
  })

  test("404s a message of another conversation", async () => {
    findByIdWithUrls.mockResolvedValue({
      ...flowMessage(flowResponseAttributes),
      conversationId: "conv-other",
    })

    await expect(getWhatsappFlowResponseView(props)).rejects.toThrow(
      "Message not found",
    )
  })

  test.each([
    ["a plain text message", null],
    [
      "an address message",
      { ...flowResponseAttributes, name: "address_message" },
    ],
  ])("404s %s", async (_label, contentAttributes) => {
    findByIdWithUrls.mockResolvedValue(flowMessage(contentAttributes))

    await expect(getWhatsappFlowResponseView(props)).rejects.toThrow(
      "WhatsApp Flow response not found",
    )
  })
})
