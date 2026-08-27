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
    findFirst: vi.fn(),
    updateReturning,
    updateSet,
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
  db: {
    query: { triggerModel: { findFirst: mocks.findFirst } },
    update: mocks.dbUpdate,
  },
  eq: (...args: unknown[]) => ({ eq: args }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  triggerModel: { id: "trigger.id" },
}))

const { updateTriggerSettings } = await import(
  "../src/features/triggers/actions/update-trigger-settings-action"
)

describe("updateTriggerSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findFirst.mockResolvedValue({
      id: "trigger-1",
      workspaceId: "workspace-1",
      name: "Cart abandoned",
      active: true,
    })
    mocks.updateReturning.mockResolvedValue([{ id: "trigger-1" }])
  })

  test("skips update and audit when active is unchanged", async () => {
    await updateTriggerSettings(
      { workspaceId: "workspace-1", id: "trigger-1" },
      { active: true },
    )

    expect(mocks.dbUpdate).not.toHaveBeenCalled()
    expect(mocks.auditRecord).not.toHaveBeenCalled()
  })

  test("records enabled detail for a real active toggle", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "trigger-1",
      workspaceId: "workspace-1",
      name: "Cart abandoned",
      active: false,
    })

    await updateTriggerSettings(
      { workspaceId: "workspace-1", id: "trigger-1" },
      { active: true },
    )

    expect(mocks.auditRecord).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      action: "update",
      detail: "enabled a trigger (#trigger-1)",
    })
  })

  test("records generic update detail for a settings update", async () => {
    await updateTriggerSettings(
      { workspaceId: "workspace-1", id: "trigger-1" },
      { name: "New name" },
    )

    expect(mocks.updateSet).toHaveBeenCalledWith({ name: "New name" })
    expect(mocks.updateReturning).toHaveBeenCalledWith({ id: "trigger.id" })
    expect(mocks.auditRecord).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      action: "update",
      detail: "updated a trigger (#trigger-1)",
    })
  })
})
