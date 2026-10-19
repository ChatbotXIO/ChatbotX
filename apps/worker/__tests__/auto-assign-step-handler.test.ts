import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listExistingUserIds: vi.fn(),
  listExistingTeamIds: vi.fn(),
  listOnShiftUserIds: vi.fn(),
  countByAssignee: vi.fn(),
  updateAssignment: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: {},
  contactService: {},
  conversationService: {
    countByAssignee: mocks.countByAssignee,
    updateAssignment: mocks.updateAssignment,
  },
  inboxTeamService: { listExistingIds: mocks.listExistingTeamIds },
  listOnShiftUserIds: mocks.listOnShiftUserIds,
  workspaceMemberService: { listExistingUserIds: mocks.listExistingUserIds },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const { stepAutoAssignConversation } = await import(
  "../src/integration/handlers/step-handlers"
)

const conversation = { id: "conv-1", workspaceId: "ws-1" }
const run = (assignedIds: string[]) =>
  stepAutoAssignConversation({
    conversation,
    step: { assignedIds, rule: "all" },
  } as unknown as Parameters<typeof stepAutoAssignConversation>[0])

const users = (...ids: string[]) => ids.map((userId) => ({ userId }))
const assignedUser = () =>
  mocks.updateAssignment.mock.calls[0]?.[0]?.assignedUserId

describe("stepAutoAssignConversation on-shift routing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listExistingTeamIds.mockResolvedValue([])
    mocks.countByAssignee.mockResolvedValue([])
  })

  test("picks the least-loaded agent among those on shift", async () => {
    mocks.listExistingUserIds.mockResolvedValue(users("a", "b", "c"))
    mocks.listOnShiftUserIds.mockResolvedValue(new Set(["b", "c"]))
    mocks.countByAssignee.mockResolvedValue([
      { assignedUserId: "b", assignedInboxTeamId: null, conversationsCount: 5 },
      { assignedUserId: "c", assignedInboxTeamId: null, conversationsCount: 2 },
    ])

    await run(["u_a", "u_b", "u_c"])

    expect(assignedUser()).toBe("c")
    expect(mocks.countByAssignee).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", userIds: ["b", "c"] }),
    )
  })

  test("falls back to every candidate when nobody is on shift", async () => {
    mocks.listExistingUserIds.mockResolvedValue(users("a", "b"))
    mocks.listOnShiftUserIds.mockResolvedValue(new Set())
    mocks.countByAssignee.mockResolvedValue([
      { assignedUserId: "a", assignedInboxTeamId: null, conversationsCount: 3 },
    ])

    await run(["u_a", "u_b"])

    expect(assignedUser()).toBe("b")
    expect(mocks.countByAssignee).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ["a", "b"] }),
    )
  })

  test("agents without a schedule stay eligible (reported on shift)", async () => {
    mocks.listExistingUserIds.mockResolvedValue(users("a", "b"))
    mocks.listOnShiftUserIds.mockResolvedValue(new Set(["a", "b"]))

    await run(["u_a", "u_b"])

    expect(mocks.updateAssignment).toHaveBeenCalledTimes(1)
    expect(mocks.countByAssignee).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ["a", "b"] }),
    )
  })

  test("teams are never filtered and no shift lookup runs for team-only steps", async () => {
    mocks.listExistingUserIds.mockResolvedValue([])
    mocks.listExistingTeamIds.mockResolvedValue([{ id: "team-1" }])

    await run(["t_team-1"])

    expect(mocks.listOnShiftUserIds).not.toHaveBeenCalled()
    expect(mocks.updateAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedUserId: null,
        assignedInboxTeamId: "team-1",
      }),
    )
  })

  test("a candidate team stays available, so off-shift users are dropped instead of winning on load", async () => {
    mocks.listExistingUserIds.mockResolvedValue(users("a"))
    mocks.listExistingTeamIds.mockResolvedValue([{ id: "team-1" }])
    mocks.listOnShiftUserIds.mockResolvedValue(new Set())

    await run(["u_a", "t_team-1"])

    expect(mocks.updateAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedUserId: null,
        assignedInboxTeamId: "team-1",
      }),
    )
  })

  test("a tie on load still picks a user before a team", async () => {
    mocks.listExistingUserIds.mockResolvedValue(users("a"))
    mocks.listExistingTeamIds.mockResolvedValue([{ id: "team-1" }])
    mocks.listOnShiftUserIds.mockResolvedValue(new Set(["a"]))

    await run(["u_a", "t_team-1"])

    expect(assignedUser()).toBe("a")
  })
})
