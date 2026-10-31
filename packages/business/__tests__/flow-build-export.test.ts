// @vitest-environment node

import { waitNodeDefaultFn } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindFlow,
  mockFindDraft,
  mockFindPublished,
  mockCustomFieldsByIds,
  mockBotFieldsByIds,
} = vi.hoisted(() => ({
  mockFindFlow: vi.fn(),
  mockFindDraft: vi.fn(),
  mockFindPublished: vi.fn(),
  mockCustomFieldsByIds: vi.fn(),
  mockBotFieldsByIds: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { flowModel: { findFirst: mockFindFlow } } },
  eq: (...args: unknown[]) => ({ eq: args }),
  inArray: (...args: unknown[]) => ({ inArray: args }),
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  flowRepository: {},
  reflinkRepository: {},
  whatsappMessageTemplateRepository: {},
}))
vi.mock("@chatbotx.io/database/partials", () => ({ rootFolderId: "0" }))
vi.mock("@chatbotx.io/database/schema", () => ({
  flowAnalyticsSessionModel: {},
  flowModel: {},
  flowVersionModel: {},
}))
vi.mock("../src/base.service", () => ({
  BaseService: class BaseService {
    audit = vi.fn()
  },
}))
vi.mock("../src/flow-version", () => ({
  assertFlowGraphPublishable: vi.fn(),
  flowVersionService: {
    findDraft: mockFindDraft,
    findPublished: mockFindPublished,
  },
}))
vi.mock("../src/bot-field/service", () => ({
  botFieldService: { findManyByIds: mockBotFieldsByIds },
}))
vi.mock("../src/custom-field/service", () => ({
  customFieldService: { findManyByIds: mockCustomFieldsByIds },
}))
vi.mock("../src/folder/service", () => ({ folderService: {} }))
vi.mock("../src/template/installed-resource.service", () => ({
  changedKeysOf: vi.fn(() => []),
  assertDeletable: vi.fn(),
  assertResourceEditable: vi.fn(),
}))
vi.mock("../src/messenger-welcome-message-flow/service", () => ({
  messengerWelcomeMessageFlowService: {},
}))

const { flowService } = await import("../src/flow/service")

const flowRow = {
  id: "2",
  workspaceId: "1",
  name: "Onboarding",
  active: true,
  enableInInbox: true,
}

const setFieldNode = (steps: Record<string, unknown>[]) => ({
  id: "1",
  position: { x: 0, y: 0 },
  measured: { width: 288, height: 100 },
  type: "sendMessage",
  data: {
    name: "Send Message",
    isStartNode: true,
    details: {
      beforeStep: {
        id: "31",
        stepType: "chooseChannel",
        channel: "omnichannel",
      },
      steps,
      quickReplies: [],
    },
  },
})

const setField = (id: string, inputFieldId: string) => ({
  id,
  stepType: "setCustomField",
  inputFieldId,
  operation: "O01",
  value: "hi",
})

describe("flowService.buildExport", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCustomFieldsByIds.mockResolvedValue([])
    mockBotFieldsByIds.mockResolvedValue([])
  })

  test("reports a missing flow as notFound without loading a version", async () => {
    mockFindFlow.mockResolvedValue(undefined)

    await expect(
      flowService.buildExport({ workspaceId: "1", id: "2" }),
    ).resolves.toEqual({ ok: false, reason: "notFound" })
    expect(mockFindPublished).not.toHaveBeenCalled()
  })

  test("reports a flow without a published version as notPublished", async () => {
    mockFindFlow.mockResolvedValue(flowRow)
    mockFindPublished.mockResolvedValue(undefined)

    await expect(
      flowService.buildExport({ workspaceId: "1", id: "2" }),
    ).resolves.toEqual({ ok: false, reason: "notPublished" })
  })

  test("exports the published version, not the draft", async () => {
    mockFindFlow.mockResolvedValue(flowRow)
    const waitNode = waitNodeDefaultFn({ nodeProps: { id: "1" } })
    mockFindPublished.mockResolvedValue({
      startNodeId: "1",
      nodes: [waitNode],
      edges: [],
    })

    const result = await flowService.buildExport({ workspaceId: "1", id: "2" })

    expect(result).toMatchObject({
      ok: true,
      fileName: "onboarding.chatbotx-flow.json",
    })
    if (!result.ok) {
      return
    }
    expect(result.envelope.formatVersion).toBe(2)
    expect(result.envelope.customFields).toEqual({})
    expect(mockFindPublished).toHaveBeenCalledWith({
      flowId: "2",
      workspaceId: "1",
    })
    expect(mockFindDraft).not.toHaveBeenCalled()
  })

  test("exports the draft when asked for it", async () => {
    mockFindFlow.mockResolvedValue(flowRow)
    mockFindDraft.mockResolvedValue({
      startNodeId: "1",
      nodes: [waitNodeDefaultFn({ nodeProps: { id: "1" } })],
      edges: [],
    })

    const result = await flowService.buildExport({
      workspaceId: "1",
      id: "2",
      version: "draft",
    })

    expect(result.ok).toBe(true)
    expect(mockFindPublished).not.toHaveBeenCalled()
  })

  test("lists referenced custom and bot fields by name, scoped to the flow's workspace", async () => {
    mockFindFlow.mockResolvedValue(flowRow)
    mockFindPublished.mockResolvedValue({
      startNodeId: "1",
      nodes: [
        setFieldNode([setField("32", "42"), setField("33", "bot_field:7")]),
      ],
      edges: [],
    })
    mockCustomFieldsByIds.mockResolvedValue([
      { id: "42", name: "Birthday", type: "date" },
    ])
    mockBotFieldsByIds.mockResolvedValue([
      { id: "7", name: "Loyalty Points", type: "number" },
    ])

    const result = await flowService.buildExport({ workspaceId: "1", id: "2" })

    if (!result.ok) {
      throw new Error("expected an export")
    }
    expect(result.envelope.customFields).toEqual({
      "42": { name: "Birthday", type: "date" },
    })
    expect(result.envelope.botFields).toEqual({
      "7": { name: "Loyalty Points", type: "number" },
    })
    expect(mockCustomFieldsByIds).toHaveBeenCalledWith({
      workspaceId: "1",
      ids: ["42"],
    })
    expect(mockBotFieldsByIds).toHaveBeenCalledWith({
      workspaceId: "1",
      ids: ["7"],
    })
  })

  test("omits a referenced field that no longer exists and still exports", async () => {
    mockFindFlow.mockResolvedValue(flowRow)
    mockFindPublished.mockResolvedValue({
      startNodeId: "1",
      nodes: [setFieldNode([setField("32", "42")])],
      edges: [],
    })

    const result = await flowService.buildExport({ workspaceId: "1", id: "2" })

    expect(result.ok && result.envelope.customFields).toEqual({})
  })
})
