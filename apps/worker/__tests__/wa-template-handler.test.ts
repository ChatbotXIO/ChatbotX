import {
  beforeEach,
  describe,
  expect,
  type MockInstance,
  test,
  vi,
} from "vitest"

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      inboxModel: { findFirst: vi.fn() },
      whatsappMessageTemplateModel: { findFirst: vi.fn() },
    },
  },
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: {
    // Echo a fixed resolved value so tests focus on parameter_name wiring.
    replaceAll: vi.fn(() => Promise.resolve("John")),
  },
}))

const { validateWhatsappTemplate, replaceWhatsappTemplateVariables } =
  await import("../src/integration/handlers/wa-template-handler")
const { db } = await import("@chatbotx.io/database/client")

const mockInboxFindFirst = db.query.inboxModel.findFirst as MockInstance
const mockTemplateFindFirst = db.query.whatsappMessageTemplateModel
  .findFirst as MockInstance

describe("validateWhatsappTemplate — new contract (entities | null)", () => {
  beforeEach(() => {
    mockInboxFindFirst.mockReset()
    mockTemplateFindFirst.mockReset()
  })

  test("returns null when inbox not found", async () => {
    mockInboxFindFirst.mockResolvedValueOnce(null)

    const result = await validateWhatsappTemplate("tmpl-1", "inbox-1")
    expect(result).toBeNull()
  })

  test("returns null when inbox has no integrationWhatsapp", async () => {
    mockInboxFindFirst.mockResolvedValueOnce({
      id: "inbox-1",
      integrationWhatsapp: null,
    })

    const result = await validateWhatsappTemplate("tmpl-1", "inbox-1")
    expect(result).toBeNull()
  })

  test("returns null when template not found", async () => {
    mockInboxFindFirst.mockResolvedValueOnce({
      id: "inbox-1",
      integrationWhatsapp: { id: "intg-99" },
    })
    mockTemplateFindFirst.mockResolvedValueOnce(null)

    const result = await validateWhatsappTemplate("tmpl-1", "inbox-1")
    expect(result).toBeNull()
  })

  test("returns { inbox, template } when both found", async () => {
    const mockInbox = { id: "inbox-1", integrationWhatsapp: { id: "intg-99" } }
    const mockTemplate = {
      id: "tmpl-1",
      name: "order_update",
      status: "APPROVED",
    }
    mockInboxFindFirst.mockResolvedValueOnce(mockInbox)
    mockTemplateFindFirst.mockResolvedValueOnce(mockTemplate)

    const result = await validateWhatsappTemplate("tmpl-1", "inbox-1")

    expect(result).not.toBeNull()
    expect(result).toMatchObject({ inbox: mockInbox, template: mockTemplate })
  })

  test("template query uses integrationWhatsappId and status APPROVED", async () => {
    mockInboxFindFirst.mockResolvedValueOnce({
      id: "inbox-1",
      integrationWhatsapp: { id: "intg-42" },
    })
    mockTemplateFindFirst.mockResolvedValueOnce({ id: "tmpl-1" })

    await validateWhatsappTemplate("tmpl-1", "inbox-1")

    const [queryArg] = mockTemplateFindFirst.mock.calls[0]
    expect(queryArg.where).toMatchObject({
      id: "tmpl-1",
      integrationWhatsappId: "intg-42",
      status: "APPROVED",
    })
  })
})

describe("replaceWhatsappTemplateVariables — named parameters", () => {
  const legacyBodyParams = { body: [{ type: "text" as const, text: "{{v}}" }] }

  test("attaches parameter_name from the template even when stored params lack it (NAMED)", async () => {
    const result = await replaceWhatsappTemplateVariables({
      templateParams: legacyBodyParams,
      variables: {} as never,
      components: [
        { type: "BODY", text: "Happy Birthday, {{user_name}}!" },
      ] as never,
    })

    expect(result.body).toEqual([
      { type: "text", text: "John", parameter_name: "user_name" },
    ])
  })

  test("does not attach parameter_name for a POSITIONAL template ({{1}})", async () => {
    const result = await replaceWhatsappTemplateVariables({
      templateParams: legacyBodyParams,
      variables: {} as never,
      components: [{ type: "BODY", text: "Hello {{1}}" }] as never,
    })

    expect(result.body).toEqual([{ type: "text", text: "John" }])
  })

  test("without components, invents no parameter_name (backward compatible)", async () => {
    const result = await replaceWhatsappTemplateVariables({
      templateParams: legacyBodyParams,
      variables: {} as never,
    })

    expect(result.body).toEqual([{ type: "text", text: "John" }])
  })

  test("maps each named body placeholder to its own parameter_name by position", async () => {
    const result = await replaceWhatsappTemplateVariables({
      templateParams: {
        body: [
          { type: "text" as const, text: "{{a}}" },
          { type: "text" as const, text: "{{b}}" },
        ],
      },
      variables: {} as never,
      components: [
        { type: "BODY", text: "{{first_name}} ordered {{order_id}}" },
      ] as never,
    })

    expect(result.body).toEqual([
      { type: "text", text: "John", parameter_name: "first_name" },
      { type: "text", text: "John", parameter_name: "order_id" },
    ])
  })
})
