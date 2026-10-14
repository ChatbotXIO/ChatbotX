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
      messengerMessageTemplateModel: { findFirst: vi.fn() },
    },
  },
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: {
    replaceAll: vi.fn(),
  },
}))

const { replaceMessengerTemplateVariables, validateMessengerTemplate } =
  await import("../src/integration/handlers/messenger-template-handler")

const { db } = await import("@chatbotx.io/database/client")
const { contactVariableService } = await import("@chatbotx.io/variables")

const mockInboxFindFirst = db.query.inboxModel.findFirst as MockInstance
const mockTemplateFindFirst = db.query.messengerMessageTemplateModel
  .findFirst as MockInstance
const mockReplaceAll = contactVariableService.replaceAll as MockInstance

// ─── replaceMessengerTemplateVariables ────────────────────────────────────────

describe("replaceMessengerTemplateVariables", () => {
  beforeEach(() => {
    mockReplaceAll.mockReset()
    mockReplaceAll.mockImplementation(({ text }: { text: string }) =>
      Promise.resolve(`REPLACED:${text}`),
    )
  })

  test("replaces header text param", async () => {
    const result = await replaceMessengerTemplateVariables({
      templateParams: {
        header: [{ type: "text", text: "Hello {{name}}" }],
      },
      variables: {} as never,
    })

    expect(result.header?.[0].text).toBe("REPLACED:Hello {{name}}")
    expect(mockReplaceAll).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Hello {{name}}" }),
    )
  })

  test("image header param passed through — replaceAll NOT called for it", async () => {
    const imageParam = {
      type: "image" as const,
      image: { link: "https://img.example.com/photo.jpg" },
    }
    const result = await replaceMessengerTemplateVariables({
      templateParams: { header: [imageParam] },
      variables: {} as never,
    })

    expect(result.header?.[0]).toEqual(imageParam)
    expect(mockReplaceAll).not.toHaveBeenCalled()
  })

  test("replaces all body params", async () => {
    const result = await replaceMessengerTemplateVariables({
      templateParams: {
        body: [{ text: "Order {{1}}" }, { text: "Tracking {{2}}" }],
      },
      variables: {} as never,
    })

    expect(result.body?.[0].text).toBe("REPLACED:Order {{1}}")
    expect(result.body?.[1].text).toBe("REPLACED:Tracking {{2}}")
    expect(mockReplaceAll).toHaveBeenCalledTimes(2)
  })

  test("no header/body — returns params unchanged, replaceAll not called", async () => {
    const params = { button: [{ sub_type: "quick_reply" as const }] }
    const result = await replaceMessengerTemplateVariables({
      templateParams: params,
      variables: {} as never,
    })

    expect(result).toEqual(params)
    expect(mockReplaceAll).not.toHaveBeenCalled()
  })

  test("buttons are left untouched", async () => {
    const params = {
      body: [{ text: "body text" }],
      button: [
        { sub_type: "quick_reply" as const, payload: "original_payload" },
      ],
    }
    const result = await replaceMessengerTemplateVariables({
      templateParams: params,
      variables: {} as never,
    })

    // button is not processed — stays the same
    expect(result.button).toEqual(params.button)
  })

  test("replaces variables in a URL button suffix", async () => {
    mockReplaceAll.mockResolvedValue("signed-token")
    const result = await replaceMessengerTemplateVariables({
      templateParams: {
        button: [
          { sub_type: "url", index: 0, text: "{{mini_app_token}}" },
          { sub_type: "phone_number", index: 1 },
        ],
      },
      variables: {} as never,
    })

    expect(mockReplaceAll).toHaveBeenCalledTimes(1)
    expect(mockReplaceAll).toHaveBeenCalledWith({
      variables: {},
      text: "{{mini_app_token}}",
      escapeValue: encodeURIComponent,
    })
    expect(result.button).toEqual([
      { sub_type: "url", index: 0, text: "signed-token" },
      { sub_type: "phone_number", index: 1 },
    ])
  })

  test("preserves parameter_name on body items", async () => {
    const result = await replaceMessengerTemplateVariables({
      templateParams: {
        body: [
          { text: "Hi {{customer_name}}", parameter_name: "customer_name" },
        ],
      },
      variables: {} as never,
    })

    expect(result.body?.[0].parameter_name).toBe("customer_name")
  })

  test("empty params returns empty object", async () => {
    const result = await replaceMessengerTemplateVariables({
      templateParams: {},
      variables: {} as never,
    })
    expect(result).toEqual({})
    expect(mockReplaceAll).not.toHaveBeenCalled()
  })
})

// ─── validateMessengerTemplate (new contract: returns entities | null) ─────────

describe("validateMessengerTemplate — new contract (entities | null)", () => {
  beforeEach(() => {
    mockInboxFindFirst.mockReset()
    mockTemplateFindFirst.mockReset()
  })

  test("returns null when inbox not found", async () => {
    mockInboxFindFirst.mockResolvedValueOnce(null)

    const result = await validateMessengerTemplate("tmpl-1", "inbox-1")
    expect(result).toBeNull()
  })

  test("returns null when inbox has no integrationMessenger", async () => {
    mockInboxFindFirst.mockResolvedValueOnce({
      id: "inbox-1",
      integrationMessenger: null,
    })

    const result = await validateMessengerTemplate("tmpl-1", "inbox-1")
    expect(result).toBeNull()
  })

  test("returns null when template not found", async () => {
    mockInboxFindFirst.mockResolvedValueOnce({
      id: "inbox-1",
      integrationMessenger: { id: "intg-99" },
    })
    mockTemplateFindFirst.mockResolvedValueOnce(null)

    const result = await validateMessengerTemplate("tmpl-1", "inbox-1")
    expect(result).toBeNull()
  })

  test("returns { inbox, template } when both found", async () => {
    const mockInbox = { id: "inbox-1", integrationMessenger: { id: "intg-99" } }
    const mockTemplate = {
      id: "tmpl-1",
      name: "order_update",
      status: "APPROVED",
    }
    mockInboxFindFirst.mockResolvedValueOnce(mockInbox)
    mockTemplateFindFirst.mockResolvedValueOnce(mockTemplate)

    const result = await validateMessengerTemplate("tmpl-1", "inbox-1")

    expect(result).not.toBeNull()
    expect(result).toMatchObject({ inbox: mockInbox, template: mockTemplate })
  })

  test("template query still uses integrationMessengerId and status APPROVED", async () => {
    mockInboxFindFirst.mockResolvedValueOnce({
      id: "inbox-1",
      integrationMessenger: { id: "intg-42" },
    })
    mockTemplateFindFirst.mockResolvedValueOnce({ id: "tmpl-1" })

    await validateMessengerTemplate("tmpl-1", "inbox-1")

    const [queryArg] = mockTemplateFindFirst.mock.calls[0]
    expect(queryArg.where).toMatchObject({
      id: "tmpl-1",
      integrationMessengerId: "intg-42",
      status: "APPROVED",
    })
  })
})
