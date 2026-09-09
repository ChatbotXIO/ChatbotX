import { beforeEach, describe, expect, test, vi } from "vitest"

const findFirstFlow = vi.fn()
const updateChain = {
  set: vi.fn(() => updateChain),
  where: vi.fn(() => updateChain),
}
const insertChain = {
  values: vi.fn(() => insertChain),
}
const txUpdate = vi.fn(() => updateChain)
const txInsert = vi.fn(() => insertChain)
const dbTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
  callback({ update: txUpdate, insert: txInsert }),
)

const and = vi.fn((...args: unknown[]) => ({ op: "and", args }))
const eq = vi.fn((...args: unknown[]) => ({ op: "eq", args }))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      flowModel: { findFirst: findFirstFlow },
      flowAnalyticsSessionModel: { findFirst: vi.fn(), findMany: vi.fn() },
    },
    transaction: dbTransaction,
    insert: vi.fn(),
    select: vi.fn(),
    execute: vi.fn(),
  },
  and,
  count: () => ({ __count: true }),
  eq,
  inArray: vi.fn((...args: unknown[]) => ({ op: "inArray", args })),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  conversationModel: {},
  flowAnalyticsSessionModel: {
    workspaceId: "fas.workspaceId",
    flowId: "fas.flowId",
    deletedAt: "fas.deletedAt",
  },
  flowNodeStatModel: {},
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: () => "generated-id",
  }
})

const { FlowStatsRepository } = await import(
  "../src/repositories/postgres/flow-stats.repository"
)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("FlowStatsRepository.resetStatsSession — cross-tenant flowId guard", () => {
  test("no-ops and never writes when flowId belongs to a different workspace", async () => {
    findFirstFlow.mockResolvedValueOnce(undefined)

    const repo = new FlowStatsRepository()
    await repo.resetStatsSession({
      workspaceId: "ws-A",
      flowId: "flow-of-ws-B",
    })

    expect(findFirstFlow).toHaveBeenCalledWith({
      where: { id: "flow-of-ws-B", workspaceId: "ws-A" },
      columns: { id: true },
    })
    // The regression this guards: without verifying the flow belongs to the
    // caller's workspace, an attacker-controlled (workspaceId, victimFlowId)
    // pair would insert an orphan FlowAnalyticsSession row on every call.
    expect(dbTransaction).not.toHaveBeenCalled()
  })

  test("resets the session when the flow belongs to the caller's workspace", async () => {
    findFirstFlow.mockResolvedValueOnce({ id: "flow-1" })

    const repo = new FlowStatsRepository()
    await repo.resetStatsSession({ workspaceId: "ws-A", flowId: "flow-1" })

    expect(dbTransaction).toHaveBeenCalledTimes(1)
    expect(txUpdate).toHaveBeenCalledTimes(1)
    expect(txInsert).toHaveBeenCalledTimes(1)
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-A", flowId: "flow-1" }),
    )
  })
})
