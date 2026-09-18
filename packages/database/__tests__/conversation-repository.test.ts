import { describe, expect, test, vi } from "vitest"

// conversation repository — `assignUserIfUnassigned` (auto-assign).
// Mocks `db.update(...).set(...).where(...).returning()` at the module
// boundary, in the tagged-object style used by
// `conversation.service.test.ts`, so the WHERE clause's guard conditions can
// be asserted directly rather than inferred from the resolved rows.

const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  isNull: vi.fn((column: unknown) => ({ isNull: column })),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  updateReturning: vi.fn(),
}))

vi.mock("../src/client", () => ({
  db: {
    update: (..._args: unknown[]) => ({
      set: (values: unknown) => {
        mocks.updateSet(values)
        return {
          where: (cond: unknown) => {
            mocks.updateWhere(cond)
            return {
              returning: () => mocks.updateReturning(),
            }
          },
        }
      },
    }),
  },
  and: mocks.and,
  eq: mocks.eq,
  isNull: mocks.isNull,
}))

vi.mock("../src/schema", () => ({
  conversationModel: {
    workspaceId: "workspaceId",
    id: "id",
    assignedUserId: "assignedUserId",
    assignedInboxTeamId: "assignedInboxTeamId",
  },
}))

const { assignUserIfUnassigned } = await import(
  "../src/repositories/conversation/repository"
)

describe("conversationRepository.assignUserIfUnassigned", () => {
  test("scopes the update to the workspace and conversation id, guarded by both assignment columns being NULL", async () => {
    mocks.updateReturning.mockResolvedValue([
      { id: "conv-1", contactId: "contact-1", assignedUserId: "user-1" },
    ])

    const result = await assignUserIfUnassigned({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      userId: "user-1",
    })

    expect(mocks.updateSet).toHaveBeenCalledWith({
      assignedUserId: "user-1",
    })
    expect(mocks.updateWhere).toHaveBeenCalledWith({
      and: [
        { eq: ["workspaceId", "ws-1"] },
        { eq: ["id", "conv-1"] },
        { isNull: "assignedUserId" },
        { isNull: "assignedInboxTeamId" },
      ],
    })
    expect(result).toEqual([
      { id: "conv-1", contactId: "contact-1", assignedUserId: "user-1" },
    ])
  })

  test("returns an empty array when the guard excludes the row (already assigned)", async () => {
    mocks.updateReturning.mockResolvedValue([])

    const result = await assignUserIfUnassigned({
      workspaceId: "ws-1",
      conversationId: "conv-2",
      userId: "user-1",
    })

    expect(result).toEqual([])
  })
})
