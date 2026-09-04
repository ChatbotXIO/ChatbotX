// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const { findMany } = vi.hoisted(() => ({
  findMany: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { workspaceMemberModel: { findMany } } },
  relationsFilterToSQL: vi.fn(),
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: vi.fn(() => ({ limit: 20, offset: 0 })),
  likeContains: (value: string) => `%${value}%`,
}))

vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: vi.fn(),
}))

const memberA = {
  id: "member-a",
  userId: "user-1",
  workspace: { id: "workspace-a" },
}
const memberB = {
  id: "member-b",
  userId: "user-1",
  workspace: { id: "workspace-b" },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("getAllWorkspaceMembers", () => {
  test("returns every real membership row unfiltered", async () => {
    findMany.mockResolvedValue([memberA, memberB])

    const { getAllWorkspaceMembers } = await import(
      "@/features/workspace-members/queries"
    )
    const result = await getAllWorkspaceMembers("user-1")

    expect(result.workspaceMembers.map((m) => m.id)).toEqual([
      memberA.id,
      memberB.id,
    ])
    expect(result.workspaceIds).toEqual(["workspace-a", "workspace-b"])
  })

  test("returns an empty result when the user has no memberships", async () => {
    findMany.mockResolvedValue([])

    const { getAllWorkspaceMembers } = await import(
      "@/features/workspace-members/queries"
    )
    const result = await getAllWorkspaceMembers("user-1")

    expect(result.workspaceMembers).toEqual([])
    expect(result.workspaces).toEqual([])
    expect(result.workspaceIds).toEqual([])
  })
})
