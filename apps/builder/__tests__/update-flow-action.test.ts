// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const updateReturning = vi.fn()
  const updateWhere = vi.fn(() => ({ returning: updateReturning }))
  const updateSet = vi.fn(() => ({ where: updateWhere }))
  const dbUpdate = vi.fn(() => ({ set: updateSet }))

  return {
    auditRecord: vi.fn(),
    dbUpdate,
    findOrFail: vi.fn(),
    updateReturning,
    updateSet,
    updateWhere,
  }
})

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: mocks.auditRecord },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { update: mocks.dbUpdate },
  eq: (...args: unknown[]) => ({ eq: args }),
  findOrFail: mocks.findOrFail,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  flowModel: { id: "flow.id" },
}))

const { updateFlowAction } = await import(
  "../src/features/flows/actions/update-flow-action"
)

type ActionHandler = (args: {
  bindArgsParsedInputs: [string, string]
  parsedInput: { name?: string; active?: boolean; enableInInbox?: boolean }
}) => Promise<unknown>

const callAction = updateFlowAction as unknown as ActionHandler

describe("updateFlowAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findOrFail.mockResolvedValue({
      id: "flow-1",
      workspaceId: "workspace-1",
      name: "Welcome",
      active: true,
      enableInInbox: true,
    })
    mocks.updateReturning.mockResolvedValue([{ id: "flow-1" }])
  })

  test("skips DB update and audit when submitted fields are unchanged", async () => {
    await callAction({
      bindArgsParsedInputs: ["workspace-1", "flow-1"],
      parsedInput: { name: "Welcome", active: true },
    })

    expect(mocks.dbUpdate).not.toHaveBeenCalled()
    expect(mocks.auditRecord).not.toHaveBeenCalled()
  })

  test("updates and audits when a field changed", async () => {
    await callAction({
      bindArgsParsedInputs: ["workspace-1", "flow-1"],
      parsedInput: { name: "Onboarding" },
    })

    expect(mocks.updateSet).toHaveBeenCalledWith({ name: "Onboarding" })
    expect(mocks.updateReturning).toHaveBeenCalledWith({ id: "flow.id" })
    expect(mocks.auditRecord).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      action: "update",
      detail: "updated a flow (#flow-1)",
    })
  })
})
