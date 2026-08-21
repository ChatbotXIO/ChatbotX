// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockDbInsert,
  mockInsertReturning,
  mockInsertValues,
  mockFlowFindFirst,
  mockMessengerTemplateFindFirst,
  mockWhatsappTemplateFindFirst,
  mockIntegrationMessengerFindFirst,
  mockIntegrationWhatsappFindFirst,
  mockReturnValidationErrors,
} = vi.hoisted(() => {
  const mockInsertReturning = vi.fn()
  const mockInsertValues = vi.fn()
  mockInsertValues.mockReturnValue({ returning: mockInsertReturning })
  const mockDbInsert = vi.fn()
  mockDbInsert.mockReturnValue({ values: mockInsertValues })

  const mockReturnValidationErrors = vi.fn(
    (_schema: unknown, errs: unknown) => ({ __validationError: errs }),
  )

  return {
    mockDbInsert,
    mockInsertReturning,
    mockInsertValues,
    mockFlowFindFirst: vi.fn(),
    mockMessengerTemplateFindFirst: vi.fn(),
    mockWhatsappTemplateFindFirst: vi.fn(),
    mockIntegrationMessengerFindFirst: vi.fn(),
    mockIntegrationWhatsappFindFirst: vi.fn(),
    mockReturnValidationErrors,
  }
})

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("next-safe-action", () => ({
  returnValidationErrors: mockReturnValidationErrors,
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: vi.fn().mockResolvedValue({
    targetWorkspaceMember: { permissions: ["emailAndPhone"] },
  }),
}))

vi.mock("@chatbotx.io/database/queries/contact-filter/permission", () => ({
  pruneEmailPhoneFilterConditions: (contactFilter: unknown) =>
    contactFilter ?? undefined,
}))

vi.mock("@chatbotx.io/database/client", async () => {
  const { messengerMessageTemplateModel } = await import(
    "@chatbotx.io/database/schema"
  )
  return {
    // `db.query.*.findFirst` is mocked directly below, so `where` conditions
    // built with these are never evaluated by real drizzle — only need to
    // not throw when called.
    eq: (...args: unknown[]) => ({ eq: args }),
    and: (...args: unknown[]) => ({ and: args }),
    db: {
      query: {
        flowModel: { findFirst: mockFlowFindFirst },
        integrationMessengerModel: {
          findFirst: mockIntegrationMessengerFindFirst,
        },
        integrationWhatsappModel: {
          findFirst: mockIntegrationWhatsappFindFirst,
        },
      },
      insert: mockDbInsert,
      // BroadcastService.load{Whatsapp,Messenger}TemplateDetail() joins the
      // template to its integration via a select() chain rather than
      // query.*.findFirst() — the "found template" mocks below stand in for
      // the chain's terminal awaited value (an array with 0 or 1 rows).
      select: () => ({
        from: (table: unknown) => ({
          innerJoin: () => ({
            where: () => ({
              limit: async () => {
                const template =
                  table === messengerMessageTemplateModel
                    ? await mockMessengerTemplateFindFirst()
                    : await mockWhatsappTemplateFindFirst()
                return template ? [template] : []
              },
            }),
          }),
        }),
      }),
    },
  }
})

vi.mock("@chatbotx.io/database/schema", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/database/schema")>()
  return {
    ...actual,
    broadcastModel: { _: "broadcastModel" },
  }
})

const { createBroadcastAction } = await import(
  "../src/features/broadcasts/actions/create-broadcast.action"
)

const WORKSPACE_ID = "ws-1"

beforeEach(() => {
  mockIntegrationMessengerFindFirst.mockResolvedValue({ id: "int-1" })
  mockIntegrationWhatsappFindFirst.mockResolvedValue({ id: "wa-int-1" })
})

const baseInput = {
  channel: "whatsapp" as const,
  subaction: "whatsappWithin24Hours" as const,
  schedulesType: "now" as const,
  schedulesAt: null,
  contactFilter: null,
}

describe("createBroadcastAction — flowId validation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInsertValues.mockReturnValue({ returning: mockInsertReturning })
    mockDbInsert.mockReturnValue({ values: mockInsertValues })
  })

  test("returns validation error when flowId provided but flow not found", async () => {
    mockFlowFindFirst.mockResolvedValue(undefined)

    const result = await (
      createBroadcastAction as (props: unknown) => Promise<unknown>
    )({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: { ...baseInput, flowId: "flow-123" },
    })

    expect(mockReturnValidationErrors).toHaveBeenCalledOnce()
    const [, errors] = mockReturnValidationErrors.mock.calls[0] as [
      unknown,
      { flowId: { _errors: string[] } },
    ]
    expect(errors.flowId._errors).toContain("Flow not found")
    expect(result).toMatchObject({ __validationError: expect.anything() })
  })

  test("sets broadcastName to flow.name when flow is found", async () => {
    const mockFlow = { id: "flow-123", name: "My Flow" }
    mockFlowFindFirst.mockResolvedValue(mockFlow)
    const mockBroadcast = { id: "bc-1", name: "My Flow" }
    mockInsertReturning.mockResolvedValue([mockBroadcast])

    await (createBroadcastAction as (props: unknown) => Promise<unknown>)({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: { ...baseInput, flowId: "flow-123" },
    })

    const insertedValues = mockInsertValues.mock.calls[0]?.[0] as {
      name: string
    }
    expect(insertedValues.name).toBe("My Flow")
  })
})

describe("createBroadcastAction — messenger template validation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInsertValues.mockReturnValue({ returning: mockInsertReturning })
    mockDbInsert.mockReturnValue({ values: mockInsertValues })
  })

  test("returns validation error when messenger template not found", async () => {
    mockMessengerTemplateFindFirst.mockResolvedValue(undefined)

    const result = await (
      createBroadcastAction as (props: unknown) => Promise<unknown>
    )({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: {
        ...baseInput,
        channel: "messenger",
        subaction: "messengerTemplateMessage",
        templateId: "tpl-1",
        integrationMessengerId: "int-1",
      },
    })

    expect(mockReturnValidationErrors).toHaveBeenCalledOnce()
    const [, errors] = mockReturnValidationErrors.mock.calls[0] as [
      unknown,
      { templateId: { _errors: string[] } },
    ]
    expect(errors.templateId._errors).toContain("Template not found")
    expect(result).toMatchObject({ __validationError: expect.anything() })
  })

  test("sets broadcastName to template.name when messenger template found", async () => {
    const mockTemplate = { id: "tpl-1", name: "Promo Template" }
    mockMessengerTemplateFindFirst.mockResolvedValue(mockTemplate)
    const mockBroadcast = { id: "bc-2", name: "Promo Template" }
    mockInsertReturning.mockResolvedValue([mockBroadcast])

    await (createBroadcastAction as (props: unknown) => Promise<unknown>)({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: {
        ...baseInput,
        channel: "messenger",
        subaction: "messengerTemplateMessage",
        templateId: "tpl-1",
        integrationMessengerId: "int-1",
      },
    })

    const insertedValues = mockInsertValues.mock.calls[0]?.[0] as {
      name: string
    }
    expect(insertedValues.name).toBe("Promo Template")
  })
})

describe("createBroadcastAction — whatsapp template validation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInsertValues.mockReturnValue({ returning: mockInsertReturning })
    mockDbInsert.mockReturnValue({ values: mockInsertValues })
  })

  test("returns validation error when whatsapp template not found", async () => {
    mockWhatsappTemplateFindFirst.mockResolvedValue(undefined)

    const result = await (
      createBroadcastAction as (props: unknown) => Promise<unknown>
    )({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: {
        ...baseInput,
        subaction: "whatsappTemplateMessage",
        channel: "whatsapp",
        templateId: "tpl-2",
        integrationWhatsappId: "wa-int-1",
      },
    })

    expect(mockReturnValidationErrors).toHaveBeenCalledOnce()
    const [, errors] = mockReturnValidationErrors.mock.calls[0] as [
      unknown,
      { templateId: { _errors: string[] } },
    ]
    expect(errors.templateId._errors).toContain("Template not found")
    expect(result).toMatchObject({ __validationError: expect.anything() })
  })

  test("sets broadcastName to template.name when whatsapp template found", async () => {
    const mockTemplate = { id: "tpl-2", name: "WA Promo" }
    mockWhatsappTemplateFindFirst.mockResolvedValue(mockTemplate)
    const mockBroadcast = { id: "bc-3", name: "WA Promo" }
    mockInsertReturning.mockResolvedValue([mockBroadcast])

    await (createBroadcastAction as (props: unknown) => Promise<unknown>)({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: {
        ...baseInput,
        subaction: "whatsappTemplateMessage",
        channel: "whatsapp",
        templateId: "tpl-2",
        integrationWhatsappId: "wa-int-1",
      },
    })

    const insertedValues = mockInsertValues.mock.calls[0]?.[0] as {
      name: string
    }
    expect(insertedValues.name).toBe("WA Promo")
  })
})

describe("createBroadcastAction — happy path insert", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInsertValues.mockReturnValue({ returning: mockInsertReturning })
    mockDbInsert.mockReturnValue({ values: mockInsertValues })
    mockFlowFindFirst.mockResolvedValue({ id: "flow-1", name: "Flow Name" })
  })

  test("inserts with status 'scheduled' and returns the broadcast", async () => {
    const mockBroadcast = { id: "bc-4", name: "Broadcast", status: "scheduled" }
    mockInsertReturning.mockResolvedValue([mockBroadcast])

    const result = await (
      createBroadcastAction as (props: unknown) => Promise<unknown>
    )({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: { ...baseInput, flowId: "flow-1" },
    })

    const insertedValues = mockInsertValues.mock.calls[0]?.[0] as {
      status: string
      workspaceId: string
    }
    expect(insertedValues.status).toBe("scheduled")
    expect(insertedValues.workspaceId).toBe(WORKSPACE_ID)
    expect(result).toBe(mockBroadcast)
  })

  test("persists integrationMessengerId so audience scoping matches the preview", async () => {
    const mockBroadcast = { id: "bc-5", name: "Broadcast" }
    mockInsertReturning.mockResolvedValue([mockBroadcast])
    mockIntegrationMessengerFindFirst.mockResolvedValue({ id: "int-999" })

    await (createBroadcastAction as (props: unknown) => Promise<unknown>)({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: {
        ...baseInput,
        channel: "messenger",
        subaction: "messengerActiveContacts",
        flowId: "flow-1",
        integrationMessengerId: "int-999",
      },
    })

    const insertedValues = mockInsertValues.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(insertedValues.integrationMessengerId).toBe("int-999")
    expect(mockIntegrationMessengerFindFirst).toHaveBeenCalledWith({
      where: { id: "int-999", workspaceId: WORKSPACE_ID },
      columns: { id: true },
    })
  })

  test("rejects a messenger integration from another workspace", async () => {
    mockIntegrationMessengerFindFirst.mockResolvedValue(undefined)

    const result = await (
      createBroadcastAction as (props: unknown) => Promise<unknown>
    )({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: {
        ...baseInput,
        channel: "messenger",
        subaction: "messengerActiveContacts",
        flowId: "flow-1",
        integrationMessengerId: "foreign-int",
      },
    })

    expect(mockReturnValidationErrors).toHaveBeenCalledOnce()
    const [, errors] = mockReturnValidationErrors.mock.calls[0] as [
      unknown,
      { integrationMessengerId: { _errors: string[] } },
    ]
    expect(errors.integrationMessengerId._errors).toContain(
      "Integration not found",
    )
    expect(mockInsertValues).not.toHaveBeenCalled()
    expect(result).toMatchObject({ __validationError: expect.anything() })
  })

  test("rejects a whatsapp integration from another workspace", async () => {
    mockIntegrationWhatsappFindFirst.mockResolvedValue(undefined)

    const result = await (
      createBroadcastAction as (props: unknown) => Promise<unknown>
    )({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: {
        ...baseInput,
        flowId: "flow-1",
        channel: "whatsapp",
        integrationWhatsappId: "foreign-wa-int",
      },
    })

    expect(mockReturnValidationErrors).toHaveBeenCalledOnce()
    const [, errors] = mockReturnValidationErrors.mock.calls[0] as [
      unknown,
      { integrationWhatsappId: { _errors: string[] } },
    ]
    expect(errors.integrationWhatsappId._errors).toContain(
      "Integration not found",
    )
    expect(mockInsertValues).not.toHaveBeenCalled()
    expect(result).toMatchObject({ __validationError: expect.anything() })
  })

  test("merges templateData with buttons when templateData is provided", async () => {
    const mockBroadcast = { id: "bc-6", name: "Broadcast" }
    mockInsertReturning.mockResolvedValue([mockBroadcast])

    const templateData = { language: "en", components: [] }
    const buttons = [{ id: "btn-1", label: "Click me" }]

    await (createBroadcastAction as (props: unknown) => Promise<unknown>)({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: {
        ...baseInput,
        flowId: "flow-1",
        templateData,
        buttons,
      },
    })

    const insertedValues = mockInsertValues.mock.calls[0]?.[0] as {
      templateData: Record<string, unknown>
    }
    expect(insertedValues.templateData).toMatchObject({
      language: "en",
      components: [],
      buttons: [{ id: "btn-1", label: "Click me" }],
    })
  })

  test("sets templateData to null when no templateData is provided", async () => {
    const mockBroadcast = { id: "bc-7", name: "Broadcast" }
    mockInsertReturning.mockResolvedValue([mockBroadcast])

    await (createBroadcastAction as (props: unknown) => Promise<unknown>)({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: { ...baseInput, flowId: "flow-1" },
    })

    const insertedValues = mockInsertValues.mock.calls[0]?.[0] as {
      templateData: null
    }
    expect(insertedValues.templateData).toBeNull()
  })

  test.each([
    {
      channel: "instagram" as const,
      subaction: "instagramActiveContacts" as const,
    },
    {
      channel: "telegram" as const,
      subaction: "telegramAllContacts" as const,
    },
    {
      channel: "tiktok" as const,
      subaction: "tiktokActiveContacts" as const,
    },
  ])("accepts $channel flow broadcasts", async ({ channel, subaction }) => {
    const mockBroadcast = { id: `bc-${channel}` }
    mockInsertReturning.mockResolvedValue([mockBroadcast])

    const result = await (
      createBroadcastAction as (props: unknown) => Promise<unknown>
    )({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: {
        ...baseInput,
        channel,
        subaction,
        flowId: "flow-1",
      },
    })

    expect(result).toBe(mockBroadcast)
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        channel,
        subaction,
        flowId: "flow-1",
      }),
    )
  })

  test("rejects non-broadcastable channels such as Webchat", async () => {
    const result = await (
      createBroadcastAction as (props: unknown) => Promise<unknown>
    )({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: {
        ...baseInput,
        channel: "webchat",
        subaction: "allContacts",
        flowId: "flow-1",
      },
    })

    expect(mockReturnValidationErrors).toHaveBeenCalledOnce()
    const [, errors] = mockReturnValidationErrors.mock.calls[0] as [
      unknown,
      { channel: { _errors: string[] } },
    ]
    expect(errors.channel._errors).toContain("Unsupported broadcast channel")
    expect(mockInsertValues).not.toHaveBeenCalled()
    expect(result).toMatchObject({ __validationError: expect.anything() })
  })

  test("rejects template broadcasts for TikTok", async () => {
    const result = await (
      createBroadcastAction as (props: unknown) => Promise<unknown>
    )({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: {
        ...baseInput,
        channel: "tiktok",
        subaction: "tiktokActiveContacts",
        templateId: "template-1",
      },
    })

    expect(mockReturnValidationErrors).toHaveBeenCalledOnce()
    const [, errors] = mockReturnValidationErrors.mock.calls[0] as [
      unknown,
      { templateId: { _errors: string[] } },
    ]
    expect(errors.templateId._errors).toContain(
      "Template broadcasts are not supported for this channel",
    )
    expect(mockInsertValues).not.toHaveBeenCalled()
    expect(result).toMatchObject({ __validationError: expect.anything() })
  })

  test("rejects template broadcasts for Telegram", async () => {
    const result = await (
      createBroadcastAction as (props: unknown) => Promise<unknown>
    )({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: {
        ...baseInput,
        channel: "telegram",
        subaction: "telegramAllContacts",
        templateId: "template-1",
      },
    })

    expect(mockReturnValidationErrors).toHaveBeenCalledOnce()
    const [, errors] = mockReturnValidationErrors.mock.calls[0] as [
      unknown,
      { templateId: { _errors: string[] } },
    ]
    expect(errors.templateId._errors).toContain(
      "Template broadcasts are not supported for this channel",
    )
    expect(mockInsertValues).not.toHaveBeenCalled()
    expect(result).toMatchObject({ __validationError: expect.anything() })
  })

  test("rejects template broadcasts for Instagram", async () => {
    const result = await (
      createBroadcastAction as (props: unknown) => Promise<unknown>
    )({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: {
        ...baseInput,
        channel: "instagram",
        subaction: "instagramActiveContacts",
        templateId: "template-1",
      },
    })

    expect(mockReturnValidationErrors).toHaveBeenCalledOnce()
    const [, errors] = mockReturnValidationErrors.mock.calls[0] as [
      unknown,
      { templateId: { _errors: string[] } },
    ]
    expect(errors.templateId._errors).toContain(
      "Template broadcasts are not supported for this channel",
    )
    expect(mockInsertValues).not.toHaveBeenCalled()
    expect(result).toMatchObject({ __validationError: expect.anything() })
  })

  test("schedulesAt is set to startOfMinute of the provided date string", async () => {
    const mockBroadcast = { id: "bc-8" }
    mockInsertReturning.mockResolvedValue([mockBroadcast])

    const schedulesAt = "2030-06-01T12:34:56.789Z"

    await (createBroadcastAction as (props: unknown) => Promise<unknown>)({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: { ...baseInput, flowId: "flow-1", schedulesAt },
    })

    const insertedValues = mockInsertValues.mock.calls[0]?.[0] as {
      schedulesAt: Date
    }
    expect(insertedValues.schedulesAt.getSeconds()).toBe(0)
    expect(insertedValues.schedulesAt.getMilliseconds()).toBe(0)
    expect(insertedValues.schedulesAt.getMinutes()).toBe(34)
  })

  test("rejects when neither flowId nor templateId is provided", async () => {
    const mockBroadcast = { id: "bc-9" }
    mockInsertReturning.mockResolvedValue([mockBroadcast])

    const result = await (
      createBroadcastAction as (props: unknown) => Promise<unknown>
    )({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: { ...baseInput },
    })

    expect(mockReturnValidationErrors).toHaveBeenCalledOnce()
    const [, errors] = mockReturnValidationErrors.mock.calls[0] as [
      unknown,
      { flowId: { _errors: string[] } },
    ]
    expect(errors.flowId._errors).toContain(
      "Either flow or template must be selected",
    )
    expect(mockInsertValues).not.toHaveBeenCalled()
    expect(result).toMatchObject({ __validationError: expect.anything() })
  })
})
