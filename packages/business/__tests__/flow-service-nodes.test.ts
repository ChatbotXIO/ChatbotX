// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findCurrentVersionNodes: vi.fn(),
  listCurrentVersionNodesByFlowIds: vi.fn(),
  selectLabelsByIds: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({ db: {}, eq: vi.fn() }))
vi.mock("@chatbotx.io/database/repositories", () => ({
  flowRepository: {
    findCurrentVersionNodes: mocks.findCurrentVersionNodes,
    listCurrentVersionNodesByFlowIds: mocks.listCurrentVersionNodesByFlowIds,
  },
}))
vi.mock("@chatbotx.io/database/partials", () => ({ rootFolderId: "0" }))
vi.mock("@chatbotx.io/database/schema", () => ({ flowModel: { tag: "flow" } }))
vi.mock("@chatbotx.io/utils", () => ({ createId: vi.fn() }))
vi.mock("@chatbotx.io/flow-config", () => ({ stepTypes: { enum: {} } }))
vi.mock("../src/select-labels-by-ids", () => ({
  selectLabelsByIds: mocks.selectLabelsByIds,
}))
vi.mock("../src/flow/filters", () => ({
  filterFlowsByStartStepType: vi.fn(),
  filterFlowsByTemplateIds: vi.fn(),
}))
vi.mock("../src/base.service", () => ({ BaseService: class {} }))
vi.mock("../src/errors", () => ({
  notFoundException: (message: string) =>
    Object.assign(new Error(message), { code: "notFound" }),
}))
vi.mock("../src/messenger-welcome-message-flow/service", () => ({
  messengerWelcomeMessageFlowService: {},
}))
vi.mock("../src/flow-version", () => ({
  assertFlowGraphPublishable: vi.fn(),
  flowVersionService: {},
}))
vi.mock("../src/bot-field/service", () => ({ botFieldService: {} }))
vi.mock("../src/custom-field/service", () => ({ customFieldService: {} }))
vi.mock("../src/folder/service", () => ({ folderService: {} }))
vi.mock("../src/template/installed-resource.service", () => ({
  assertDeletable: vi.fn(),
}))

const { flowService } = await import("../src/flow/service")

const node = (id: string, name?: string, type = "sendMessage") => ({
  id,
  type,
  data: name === undefined ? {} : { name },
})

describe("flowService.listNodes", () => {
  beforeEach(() => vi.clearAllMocks())

  test("maps the published nodes to id, label and type", async () => {
    mocks.findCurrentVersionNodes.mockResolvedValue([
      node("9", "Welcome"),
      node("10", "Check", "condition"),
    ])

    expect(
      await flowService.listNodes({ workspaceId: "ws-1", flowId: "7" }),
    ).toEqual([
      { flowId: "7", nodeId: "9", label: "Welcome", nodeType: "sendMessage" },
      { flowId: "7", nodeId: "10", label: "Check", nodeType: "condition" },
    ])
    expect(mocks.findCurrentVersionNodes).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      flowId: "7",
    })
  })

  test("falls back to the node id when a node has no usable name", async () => {
    mocks.findCurrentVersionNodes.mockResolvedValue([
      node("9"),
      node("10", "   "),
    ])

    const result = await flowService.listNodes({
      workspaceId: "ws-1",
      flowId: "7",
    })

    expect(result.map((entry) => entry.label)).toEqual(["9", "10"])
  })

  test("a flow that was never published has no nodes", async () => {
    mocks.findCurrentVersionNodes.mockResolvedValue([])

    expect(
      await flowService.listNodes({ workspaceId: "ws-1", flowId: "7" }),
    ).toEqual([])
  })

  test("an unknown flow is a not-found error, not an empty list", async () => {
    mocks.findCurrentVersionNodes.mockResolvedValue(undefined)

    await expect(
      flowService.listNodes({ workspaceId: "ws-1", flowId: "404" }),
    ).rejects.toThrow("Flow does not exists.")
  })
})

describe("flowService.listNodeLabelsByIds", () => {
  beforeEach(() => vi.clearAllMocks())

  test("labels each reference as Flow · Node and looks each flow up once", async () => {
    mocks.listCurrentVersionNodesByFlowIds.mockResolvedValue([
      {
        flowId: "7",
        flowName: "Flow A",
        nodes: [node("9", "Welcome"), node("10", "Check")],
      },
    ])

    const labels = await flowService.listNodeLabelsByIds({
      workspaceId: "ws-1",
      ids: ["7:9", "7:10"],
    })

    expect(mocks.listCurrentVersionNodesByFlowIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      flowIds: ["7"],
    })
    expect(labels).toEqual([
      { id: "7:9", name: "Flow A · Welcome" },
      { id: "7:10", name: "Flow A · Check" },
    ])
  })

  test("omits a reference whose flow or node is gone so it can be shown as deleted", async () => {
    mocks.listCurrentVersionNodesByFlowIds.mockResolvedValue([
      { flowId: "7", flowName: "Flow A", nodes: [node("9", "Welcome")] },
    ])

    const labels = await flowService.listNodeLabelsByIds({
      workspaceId: "ws-1",
      ids: ["7:9", "7:99", "8:1"],
    })

    expect(labels).toEqual([{ id: "7:9", name: "Flow A · Welcome" }])
  })

  test("ignores a malformed reference instead of querying with it", async () => {
    mocks.listCurrentVersionNodesByFlowIds.mockResolvedValue([])

    expect(
      await flowService.listNodeLabelsByIds({
        workspaceId: "ws-1",
        ids: ["9", ":9", "7:"],
      }),
    ).toEqual([])
    expect(mocks.listCurrentVersionNodesByFlowIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      flowIds: [],
    })
  })
})

describe("flowService.listLabelsByIds", () => {
  test("is a workspace-scoped primary-key lookup", async () => {
    mocks.selectLabelsByIds.mockResolvedValue([{ id: "7", name: "Flow A" }])

    expect(
      await flowService.listLabelsByIds({ workspaceId: "ws-1", ids: ["7"] }),
    ).toEqual([{ id: "7", name: "Flow A" }])
    expect(mocks.selectLabelsByIds).toHaveBeenCalledWith(
      { tag: "flow" },
      { workspaceId: "ws-1", ids: ["7"] },
    )
  })
})
