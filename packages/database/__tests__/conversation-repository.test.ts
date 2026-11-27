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
  insertValues: vi.fn(),
  insertOnConflictDoNothing: vi.fn(),
}))

const insertInto = () => ({
  values: (rows: unknown) => {
    mocks.insertValues(rows)
    return {
      onConflictDoNothing: () => mocks.insertOnConflictDoNothing(),
    }
  },
})

vi.mock("../src/client", () => ({
  db: {
    insert: insertInto,
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
  sql: vi.fn(),
}))

vi.mock("../src/schema", () => ({
  conversationModel: {
    workspaceId: "workspaceId",
    id: "id",
    assignedUserId: "assignedUserId",
    assignedInboxTeamId: "assignedInboxTeamId",
  },
}))

const {
  assignTargetIfUnassigned,
  assignUserIfUnassigned,
  insertDmConversationsIfAbsent,
} = await import("../src/repositories/conversation/repository")

describe("conversationRepository.insertDmConversationsIfAbsent", () => {
  test("inserts one DM (sourceId null) per contact, each with its own id", async () => {
    mocks.insertOnConflictDoNothing.mockResolvedValue(undefined)

    await insertDmConversationsIfAbsent({
      workspaceId: "ws-1",
      contactIds: ["contact-1", "contact-2"],
    })

    const rows = mocks.insertValues.mock.calls.at(-1)?.[0] as Array<{
      id: string
      workspaceId: string
      contactId: string
      sourceId: null
    }>
    expect(
      rows.map(({ workspaceId, contactId, sourceId }) => ({
        workspaceId,
        contactId,
        sourceId,
      })),
    ).toEqual([
      { workspaceId: "ws-1", contactId: "contact-1", sourceId: null },
      { workspaceId: "ws-1", contactId: "contact-2", sourceId: null },
    ])
    expect(new Set(rows.map((row) => row.id)).size).toBe(2)
  })

  test("skips conflicts instead of failing, so a DM opened concurrently is not an error", async () => {
    mocks.insertOnConflictDoNothing.mockResolvedValue(undefined)

    await insertDmConversationsIfAbsent({
      workspaceId: "ws-1",
      contactIds: ["contact-1"],
    })

    expect(mocks.insertOnConflictDoNothing).toHaveBeenCalled()
  })

  test("uses the transaction handle it is given", async () => {
    mocks.insertOnConflictDoNothing.mockResolvedValue(undefined)
    const txInsert = vi.fn(() => ({
      values: () => ({ onConflictDoNothing: () => Promise.resolve() }),
    }))

    await insertDmConversationsIfAbsent(
      { workspaceId: "ws-1", contactIds: ["contact-1"] },
      { insert: txInsert } as never,
    )

    expect(txInsert).toHaveBeenCalledTimes(1)
  })
})

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
      assignedUserAt: expect.any(Date),
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

  test("stamps assignedUserAt with the supplied instant", async () => {
    mocks.updateReturning.mockResolvedValue([])
    const assignedAt = new Date("2026-10-18T09:00:00.000Z")

    await assignUserIfUnassigned({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      userId: "user-1",
      assignedAt,
    })

    expect(mocks.updateSet).toHaveBeenCalledWith({
      assignedUserId: "user-1",
      assignedUserAt: assignedAt,
    })
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

describe("conversationRepository.assignTargetIfUnassigned", () => {
  test("sets assignedUserAt when a user is assigned", async () => {
    mocks.updateSet.mockClear()
    mocks.updateReturning.mockResolvedValue([])
    const assignedAt = new Date("2026-10-18T09:00:00.000Z")

    await assignTargetIfUnassigned({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      assignedUserId: "user-1",
      assignedAt,
    })

    expect(mocks.updateSet).toHaveBeenCalledWith({
      assignedInboxTeamId: null,
      assignedUserId: "user-1",
      assignedUserAt: assignedAt,
    })
  })

  test("does not touch assignedUserAt for a team-only assignment", async () => {
    mocks.updateSet.mockClear()
    mocks.updateReturning.mockResolvedValue([])

    await assignTargetIfUnassigned({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      assignedInboxTeamId: "team-1",
    })

    const values = mocks.updateSet.mock.calls[0][0] as Record<string, unknown>
    expect(values).toEqual({
      assignedInboxTeamId: "team-1",
      assignedUserId: null,
    })
    expect("assignedUserAt" in values).toBe(false)
  })
})
