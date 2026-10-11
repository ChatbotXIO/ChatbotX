import { beforeEach, describe, expect, test, vi } from "vitest"

type CapturedProcedure = {
  path: string
  handler?: (...args: any[]) => any
}

const { authorizedAPI, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []
  const authorizedAPI = {
    route: vi.fn((config: { path: string }) => {
      const record: CapturedProcedure = { path: config.path }
      capturedProcedures.push(record)
      const chain = {
        input: vi.fn(() => chain),
        use: vi.fn(() => chain),
        output: vi.fn(() => chain),
        errors: vi.fn(() => chain),
        handler: vi.fn((fn: (...args: any[]) => any) => {
          record.handler = fn
          return { handler: fn }
        }),
      }
      return chain
    }),
  }
  return { authorizedAPI, capturedProcedures }
})

const m = vi.hoisted(() => ({
  getStartNode: vi.fn(),
  convert: vi.fn(),
  listCurrentByFlow: vi.fn(),
}))

vi.mock("@/orpc", () => ({ authorizedAPI }))
vi.mock("@/middlewares/auth", () => ({ workspaceAuthorizedMidddleware: {} }))
vi.mock("@/features/flow-versions/schema/resource", () => ({
  flowVersionResource: {},
}))
vi.mock("@/features/workspaces/schema/resource", () => ({
  withWorkspaceIdSchema: { and: vi.fn(() => ({})) },
}))
vi.mock("../src/features/flows/queries", () => ({ listFlows: vi.fn() }))
vi.mock("../src/features/flows/schema/query", () => ({
  listFlowsRequest: { and: vi.fn(() => ({})) },
  listFlowsResponse: {},
}))
vi.mock("@chatbotx.io/analytics", () => ({
  flowAnalyticsService: {},
  flowNodeStatsResponse: {},
  flowStatsRequest: { and: vi.fn(() => ({})) },
}))
vi.mock("@chatbotx.io/business", () => ({
  flowVersionService: { getMessengerAdsStartNode: m.getStartNode },
  messengerWelcomeMessageFlowService: {
    listCurrentByFlow: m.listCurrentByFlow,
  },
}))
vi.mock("@chatbotx.io/integration-messenger/messenger-ads", () => ({
  convertStartNodeToMessengerAdsJson: m.convert,
}))
vi.mock("@chatbotx.io/database/schema", () => {
  const schema = {
    pick: vi.fn(() => schema),
    extend: vi.fn(() => schema),
    omit: vi.fn(() => schema),
    and: vi.fn(() => schema),
  }
  return { createSelectSchema: vi.fn(() => schema), flowModel: {} }
})

await import("../src/features/flows/api/private")

const procedure = capturedProcedures.find(
  (p) =>
    p.path === "/workspaces/{workspaceId}/flows/{flowId}/messenger-ads-json",
)

describe("privateGetMessengerAdsJsonAPI", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns the JSON together with the current welcome message flows", async () => {
    m.getStartNode.mockResolvedValue({
      status: "ok",
      flowVersionId: "v1",
      startNode: {},
    })
    m.convert.mockReturnValue({
      status: "ok",
      messages: [{ message: { text: "Hi" } }],
    })
    m.listCurrentByFlow.mockResolvedValue([
      { integrationMessengerId: "3", pageId: "p", welcomeMessageFlowId: "m" },
    ])

    const result = await procedure?.handler?.({
      input: { workspaceId: "1", flowId: "2" },
    })

    expect(m.listCurrentByFlow).toHaveBeenCalledWith({
      workspaceId: "1",
      flowId: "2",
    })
    expect(result).toEqual({
      status: "ok",
      json: JSON.stringify([{ message: { text: "Hi" } }]),
      welcomeMessageFlows: [
        { integrationMessengerId: "3", pageId: "p", welcomeMessageFlowId: "m" },
      ],
    })
  })

  test("strict-conversion errors still return the synced welcome message flows", async () => {
    m.getStartNode.mockResolvedValue({
      status: "ok",
      flowVersionId: "v1",
      startNode: {},
    })
    m.convert.mockReturnValue({ status: "error", reason: "invalidVariable" })
    m.listCurrentByFlow.mockResolvedValue([
      { integrationMessengerId: "3", pageId: "p", welcomeMessageFlowId: "m" },
    ])

    const result = await procedure?.handler?.({
      input: { workspaceId: "1", flowId: "2" },
    })

    expect(result).toEqual({
      status: "error",
      reason: "invalidVariable",
      welcomeMessageFlows: [
        { integrationMessengerId: "3", pageId: "p", welcomeMessageFlowId: "m" },
      ],
    })
  })

  test("an unpublished flow returns its error with an empty list", async () => {
    m.getStartNode.mockResolvedValue({ status: "notPublished" })
    m.listCurrentByFlow.mockResolvedValue([])

    const result = await procedure?.handler?.({
      input: { workspaceId: "1", flowId: "2" },
    })

    expect(result).toEqual({
      status: "error",
      reason: "notPublished",
      welcomeMessageFlows: [],
    })
  })
})
