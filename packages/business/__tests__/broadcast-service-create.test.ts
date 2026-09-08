import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindCapability,
  findFirstFlow,
  findFirstIntegrationWhatsapp,
  findFirstIntegrationMessenger,
  insertValues,
  insertReturning,
  mockPruneFilter,
  mockDispatchAuditRecord,
} = vi.hoisted(() => ({
  mockFindCapability: vi.fn(),
  findFirstFlow: vi.fn(),
  findFirstIntegrationWhatsapp: vi.fn(),
  findFirstIntegrationMessenger: vi.fn(),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  mockPruneFilter: vi.fn((filter: unknown) => filter),
  mockDispatchAuditRecord: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      flowModel: { findFirst: findFirstFlow },
      integrationWhatsappModel: { findFirst: findFirstIntegrationWhatsapp },
      integrationMessengerModel: { findFirst: findFirstIntegrationMessenger },
    },
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        insertValues(values)
        return { returning: () => insertReturning() }
      },
    }),
  },
  and: (...args: unknown[]) => ({ __and: args }),
  asc: vi.fn(),
  count: vi.fn(),
  desc: vi.fn(),
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
  findOrFail: vi.fn(),
  gt: vi.fn(),
  inArray: vi.fn(),
  isNotNull: vi.fn(),
  isNull: vi.fn(),
  ne: vi.fn(),
  or: vi.fn(),
  sql: Object.assign(vi.fn(), { raw: vi.fn() }),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  broadcastStatuses: { enum: { draft: "draft", scheduled: "scheduled" } },
  findBroadcastChannelCapability: mockFindCapability,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: {},
  contactInboxModel: {},
  contactModel: {},
  contactsOnBroadcastsModel: {},
  conversationModel: {},
  integrationMessengerModel: {},
  integrationWhatsappModel: {},
  messengerMessageTemplateModel: {},
  whatsappMessageTemplateModel: {},
}))

vi.mock("@chatbotx.io/database/queries", () => ({
  buildContactInboxContactFilterSQL: vi.fn(),
  contactInboxInteractedWithin24hSQL: vi.fn(),
  pruneEmailPhoneFilterConditions: mockPruneFilter,
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  chunkById: vi.fn(),
  likeContains: vi.fn(),
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: vi.fn(() => "generated-id"),
}))

vi.mock("../src/inbox/service", () => ({ inboxService: {} }))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mockDispatchAuditRecord,
}))

const { broadcastService } = await import("../src/broadcast/service")

const WS = "ws-1"

const baseInput = {
  workspaceId: WS,
  canViewEmailAndPhone: true,
  channel: "whatsapp" as const,
  subaction: "sendMessage" as const,
  schedulesType: "now" as const,
  schedulesAt: null,
  flowId: "flow-1",
  saveAsDraft: false,
}

describe("broadcastService.create — validation branches", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPruneFilter.mockImplementation((filter: unknown) => filter)
    insertReturning.mockResolvedValue([{ id: "broadcast-1" }])
  })

  test("throws validationException(channel) for an unsupported channel", async () => {
    mockFindCapability.mockReturnValue(undefined)

    await expect(broadcastService.create(baseInput)).rejects.toMatchObject({
      code: "validation",
      field: "channel",
      message: "Unsupported broadcast channel",
    })
  })

  test("throws validationException(subaction) for an unsupported subaction", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["other"],
      supportsTemplateBroadcast: false,
    })

    await expect(broadcastService.create(baseInput)).rejects.toMatchObject({
      code: "validation",
      field: "subaction",
      message: "Unsupported broadcast subaction",
    })
  })

  test("throws validationException(flowId) when neither flow nor template is given", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["sendMessage"],
      supportsTemplateBroadcast: false,
    })

    await expect(
      broadcastService.create({ ...baseInput, flowId: undefined }),
    ).rejects.toMatchObject({
      code: "validation",
      field: "flowId",
      message: "Either flow or template must be selected",
    })
  })

  test("throws validationException(templateId) when the channel does not support template broadcasts", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["sendMessage"],
      supportsTemplateBroadcast: false,
    })

    await expect(
      broadcastService.create({
        ...baseInput,
        flowId: undefined,
        templateId: "template-1",
      }),
    ).rejects.toMatchObject({
      code: "validation",
      field: "templateId",
      message: "Template broadcasts are not supported for this channel",
    })
  })

  test("throws validationException(integrationMessengerId) when the integration is not owned", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["sendMessage"],
      supportsTemplateBroadcast: false,
    })
    findFirstIntegrationMessenger.mockResolvedValue(undefined)

    await expect(
      broadcastService.create({
        ...baseInput,
        integrationMessengerId: "integration-1",
      }),
    ).rejects.toMatchObject({
      code: "validation",
      field: "integrationMessengerId",
      message: "Integration not found",
    })
  })

  test("attributes the ownership error to integrationWhatsappId when both ids are supplied and only WhatsApp is not owned", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["sendMessage"],
      supportsTemplateBroadcast: false,
    })
    findFirstIntegrationMessenger.mockResolvedValue({ id: "integration-1" })
    findFirstIntegrationWhatsapp.mockResolvedValue(undefined)

    await expect(
      broadcastService.create({
        ...baseInput,
        integrationMessengerId: "integration-1",
        integrationWhatsappId: "integration-2",
      }),
    ).rejects.toMatchObject({
      code: "validation",
      field: "integrationWhatsappId",
      message: "Integration not found",
    })
  })

  test("throws validationException(flowId) when the flow does not belong to the workspace", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["sendMessage"],
      supportsTemplateBroadcast: false,
    })
    findFirstFlow.mockResolvedValue(undefined)

    await expect(broadcastService.create(baseInput)).rejects.toMatchObject({
      code: "validation",
      field: "flowId",
      message: "Flow not found",
    })
  })

  test("creates the broadcast and audits create + launch when scheduled now", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["sendMessage"],
      supportsTemplateBroadcast: false,
    })
    findFirstFlow.mockResolvedValue({ id: "flow-1", name: "My Flow" })

    const result = await broadcastService.create(baseInput)

    expect(result).toEqual({ id: "broadcast-1" })
    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "create",
      detail: "created a new broadcast (#broadcast-1)",
    })
    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "launch",
      detail: "launched a broadcast (#broadcast-1)",
    })
  })

  test("does not launch-audit when saveAsDraft is true", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["sendMessage"],
      supportsTemplateBroadcast: false,
    })
    findFirstFlow.mockResolvedValue({ id: "flow-1", name: "My Flow" })

    await broadcastService.create({ ...baseInput, saveAsDraft: true })

    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "create",
      detail: "created a new broadcast (#broadcast-1)",
    })
    expect(mockDispatchAuditRecord).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "launch" }),
    )
  })

  test("does not launch-audit when schedulesType is not 'now'", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["sendMessage"],
      supportsTemplateBroadcast: false,
    })
    findFirstFlow.mockResolvedValue({ id: "flow-1", name: "My Flow" })

    await broadcastService.create({
      ...baseInput,
      schedulesType: "scheduled" as never,
    })

    expect(mockDispatchAuditRecord).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "launch" }),
    )
  })
})
