// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockAudit,
  mockCreateId,
  mockDbTransaction,
  mockFindFlow,
  mockFindDraft,
  mockFindPublished,
  mockInvalidateList,
  mockEnqueueSync,
  mockListNamesWithPrefix,
  insertedByTable,
} = vi.hoisted(() => ({
  mockAudit: vi.fn(),
  mockCreateId: vi.fn(),
  mockDbTransaction: vi.fn(),
  mockFindFlow: vi.fn(),
  mockFindDraft: vi.fn(),
  mockFindPublished: vi.fn(),
  mockInvalidateList: vi.fn(),
  mockEnqueueSync: vi.fn(),
  mockListNamesWithPrefix: vi.fn(),
  insertedByTable: new Map<string, unknown[]>(),
}))

const flowModel = { table: "flow" }
const flowAnalyticsSessionModel = { table: "analytics" }
const flowVersionModel = { table: "version" }

const tx = {
  query: { flowModel: { findFirst: mockFindFlow } },
  insert: (model: { table: string }) => ({
    values: (values: unknown) => {
      insertedByTable.set(model.table, [
        ...(insertedByTable.get(model.table) ?? []),
        ...(Array.isArray(values) ? values : [values]),
      ])
      return Promise.resolve()
    },
  }),
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: mockDbTransaction,
    query: { flowModel: { findFirst: mockFindFlow } },
  },
  eq: vi.fn(),
  inArray: vi.fn(),
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  flowRepository: { listNamesWithPrefix: mockListNamesWithPrefix },
  reflinkRepository: {},
  whatsappMessageTemplateRepository: {},
}))
vi.mock("@chatbotx.io/database/partials", () => ({ rootFolderId: "0" }))
vi.mock("@chatbotx.io/database/schema", () => ({
  flowAnalyticsSessionModel,
  flowModel,
  flowVersionModel,
}))
vi.mock("@chatbotx.io/utils", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createId: mockCreateId,
}))
vi.mock("../src/base.service", () => ({
  BaseService: class BaseService {
    audit = mockAudit
  },
}))
vi.mock("../src/flow-version", () => ({
  assertFlowGraphPublishable: vi.fn(),
  flowVersionService: {
    findDraft: mockFindDraft,
    findPublished: mockFindPublished,
    invalidateList: mockInvalidateList,
  },
}))
vi.mock("../src/bot-field/service", () => ({ botFieldService: {} }))
vi.mock("../src/custom-field/service", () => ({ customFieldService: {} }))
vi.mock("../src/folder/service", () => ({ folderService: {} }))
vi.mock("../src/template/installed-resource.service", () => ({
  changedKeysOf: vi.fn(() => []),
  assertDeletable: vi.fn(),
  assertResourceEditable: vi.fn(),
}))
vi.mock("../src/messenger-welcome-message-flow/service", () => ({
  messengerWelcomeMessageFlowService: { enqueueSync: mockEnqueueSync },
}))

const { flowService } = await import("../src/flow/service")

const source = {
  id: "flow-1",
  workspaceId: "ws-1",
  name: "Welcome",
  active: true,
  enableInInbox: true,
  folderId: "folder-1",
}

/** A graph whose step jumps to a flow: the shape `remap` rewrites for kind `flow`. */
const graphReferencing = (flowId: string) => ({
  startNodeId: "n1",
  nodes: [
    {
      id: "n1",
      type: "startAnotherFlow",
      data: { details: { steps: [{ stepType: "startAnotherFlow", flowId }] } },
    },
  ],
  edges: [],
})

const insertedVersions = () =>
  (insertedByTable.get("version") ?? []) as {
    isDraft: boolean
    isLatest: boolean
    nodes: unknown
  }[]

describe("flowService.duplicate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    insertedByTable.clear()
    mockDbTransaction.mockImplementation(async (callback) => callback(tx))
    mockFindFlow.mockResolvedValue(source)
    mockListNamesWithPrefix.mockResolvedValue([])
    mockFindPublished.mockResolvedValue(undefined)
    let counter = 0
    mockCreateId.mockImplementation(() => `id-${++counter}`)
  })

  test("throws when the source flow does not exist", async () => {
    mockFindFlow.mockResolvedValue(undefined)

    await expect(
      flowService.duplicate({ workspaceId: "ws-1", id: "flow-1" }),
    ).rejects.toThrow("Flow not found")
    expect(insertedByTable.size).toBe(0)
  })

  test("throws when the source flow has no draft version", async () => {
    mockFindDraft.mockResolvedValue(undefined)

    await expect(
      flowService.duplicate({ workspaceId: "ws-1", id: "flow-1" }),
    ).rejects.toThrow("Draft version not found")
    expect(insertedByTable.size).toBe(0)
  })

  test("a draft-only source gives an inactive draft-only copy", async () => {
    mockFindDraft.mockResolvedValue(graphReferencing("other"))

    const id = await flowService.duplicate({
      workspaceId: "ws-1",
      id: "flow-1",
    })

    expect(insertedByTable.get("flow")).toEqual([
      expect.objectContaining({
        id,
        name: "Welcome _copy",
        active: false,
        currentVersionId: null,
        folderId: "folder-1",
      }),
    ])
    expect(insertedVersions()).toHaveLength(1)
    expect(insertedVersions()[0]).toMatchObject({ isDraft: true })
    // Nothing is live, so there is no welcome-message flow to sync.
    expect(mockEnqueueSync).not.toHaveBeenCalled()
  })

  test("a published source gives a copy with its own published version, keeping active", async () => {
    mockFindDraft.mockResolvedValue(graphReferencing("other"))
    mockFindPublished.mockResolvedValue({
      ...graphReferencing("other"),
      startNodeId: "n1",
    })

    const id = await flowService.duplicate({
      workspaceId: "ws-1",
      id: "flow-1",
    })

    const [flowRow] = insertedByTable.get("flow") as {
      active: boolean
      currentVersionId: string | null
    }[]
    expect(flowRow).toMatchObject({ active: true })
    expect(flowRow.currentVersionId).not.toBeNull()
    expect(
      insertedVersions().map(({ isDraft, isLatest }) => ({
        isDraft,
        isLatest,
      })),
    ).toEqual([
      { isDraft: true, isLatest: false },
      { isDraft: false, isLatest: true },
    ])
    expect(mockInvalidateList).toHaveBeenCalledWith(id)
    expect(mockEnqueueSync).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      flowId: id,
      reason: "publish",
    })
  })

  test("references to the source flow itself point at the copy, others are untouched", async () => {
    const graph = {
      startNodeId: "n1",
      nodes: [
        {
          id: "n1",
          type: "startAnotherFlow",
          data: {
            details: {
              steps: [
                { stepType: "startAnotherFlow", flowId: "flow-1" },
                { stepType: "startAnotherFlow", flowId: "someone-else" },
              ],
            },
          },
        },
      ],
      edges: [],
    }
    mockFindDraft.mockResolvedValue(graph)
    mockFindPublished.mockResolvedValue(graph)

    const id = await flowService.duplicate({
      workspaceId: "ws-1",
      id: "flow-1",
    })

    for (const version of insertedVersions()) {
      const steps = JSON.stringify(version.nodes)
      expect(steps).toContain(`"flowId":"${id}"`)
      expect(steps).toContain('"flowId":"someone-else"')
      expect(steps).not.toContain('"flowId":"flow-1"')
    }
    // The source's own graph is not mutated.
    expect(JSON.stringify(graph.nodes)).toContain('"flowId":"flow-1"')
  })

  test("a second copy takes the next free name", async () => {
    mockFindDraft.mockResolvedValue(graphReferencing("other"))
    mockListNamesWithPrefix.mockResolvedValue(["Welcome _copy"])

    await flowService.duplicate({ workspaceId: "ws-1", id: "flow-1" })

    expect(insertedByTable.get("flow")).toEqual([
      expect.objectContaining({ name: "Welcome _copy 2" }),
    ])
  })

  test("a long name is cut so the copy suffix still fits the limit", async () => {
    mockFindFlow.mockResolvedValue({ ...source, name: "x".repeat(255) })
    mockFindDraft.mockResolvedValue(graphReferencing("other"))

    await flowService.duplicate({ workspaceId: "ws-1", id: "flow-1" })

    const [flowRow] = insertedByTable.get("flow") as { name: string }[]
    expect(flowRow.name).toHaveLength(255)
    expect(flowRow.name.endsWith(" _copy")).toBe(true)
  })

  test("is audited as a create", async () => {
    mockFindDraft.mockResolvedValue(graphReferencing("other"))

    await flowService.duplicate({ workspaceId: "ws-1", id: "flow-1" })

    expect(mockAudit).toHaveBeenCalledWith("create", expect.any(String))
  })
})
