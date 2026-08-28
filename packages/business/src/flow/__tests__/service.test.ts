// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindOrFail,
  mockDbUpdate,
  mockUpdateSet,
  mockUpdateReturning,
  mockAudit,
} = vi.hoisted(() => {
  const updateReturning = vi.fn()
  const updateWhere = vi.fn(() => ({ returning: updateReturning }))
  const updateSet = vi.fn(() => ({ where: updateWhere }))
  const dbUpdate = vi.fn(() => ({ set: updateSet }))

  return {
    mockFindOrFail: vi.fn(),
    mockDbUpdate: dbUpdate,
    mockUpdateSet: updateSet,
    mockUpdateReturning: updateReturning,
    mockAudit: vi.fn(),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: { update: mockDbUpdate },
  eq: (...args: unknown[]) => ({ eq: args }),
  findOrFail: mockFindOrFail,
  inArray: (...args: unknown[]) => ({ inArray: args }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  flowModel: { id: "flow.id" },
  flowAnalyticsSessionModel: {},
  flowVersionModel: {},
}))

class FakeBaseService {
  invalidateCacheTags = vi.fn()
  audit = mockAudit
}
vi.mock("../../base.service", () => ({ BaseService: FakeBaseService }))

const { flowService } = await import("../service")

const WS = "workspace-1"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("FlowService.update", () => {
  test("skips DB update and audit when submitted fields are unchanged", async () => {
    mockFindOrFail.mockResolvedValueOnce({
      id: "flow-1",
      workspaceId: WS,
      name: "Welcome",
      active: true,
      enableInInbox: true,
    })

    await flowService.update({
      workspaceId: WS,
      id: "flow-1",
      data: { name: "Welcome", active: true },
    })

    expect(mockDbUpdate).not.toHaveBeenCalled()
    expect(mockAudit).not.toHaveBeenCalled()
  })

  test("updates and audits when a field changed", async () => {
    mockFindOrFail.mockResolvedValueOnce({
      id: "flow-1",
      workspaceId: WS,
      name: "Welcome",
      active: true,
      enableInInbox: true,
    })
    mockUpdateReturning.mockResolvedValueOnce([{ id: "flow-1" }])

    await flowService.update({
      workspaceId: WS,
      id: "flow-1",
      data: { name: "Onboarding" },
    })

    expect(mockDbUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdateSet).toHaveBeenCalledWith({ name: "Onboarding" })
    expect(mockAudit).toHaveBeenCalledTimes(1)
  })

  test("does not audit when the update returns no rows", async () => {
    mockFindOrFail.mockResolvedValueOnce({
      id: "flow-1",
      workspaceId: WS,
      name: "Welcome",
      active: true,
      enableInInbox: true,
    })
    mockUpdateReturning.mockResolvedValueOnce([])

    await flowService.update({
      workspaceId: WS,
      id: "flow-1",
      data: { name: "Onboarding" },
    })

    expect(mockDbUpdate).toHaveBeenCalledTimes(1)
    expect(mockAudit).not.toHaveBeenCalled()
  })
})
