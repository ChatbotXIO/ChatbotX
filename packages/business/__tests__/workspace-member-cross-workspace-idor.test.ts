import { beforeEach, describe, expect, test, vi } from "vitest"

type Row = Record<string, unknown>

const matchesWhere = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([key, condition]) => row[key] === condition)

const memberRows: Row[] = [
  {
    id: "member-a",
    workspaceId: "workspace-a",
    userId: "user-a",
    permissions: { superAdmin: false },
    notificationTypes: [],
    notificationChannels: [],
  },
]

const findFirst = vi.fn(
  async ({ where }: { where: Row }) =>
    memberRows.find((row) => matchesWhere(row, where)) ?? undefined,
)

const updateBuilder = {
  set: vi.fn(() => updateBuilder),
  where: vi.fn(() => updateBuilder),
  returning: vi.fn(async () => [] as Row[]),
}

const db = {
  query: { workspaceMemberModel: { findFirst } },
  update: vi.fn(() => updateBuilder),
}
vi.mock("@chatbotx.io/database/client", () => ({
  db,
  and: (...conditions: unknown[]) => ({ and: conditions }),
  eq: (column: unknown, value: unknown) => ({ column, value }),
  relationsFilterToSQL: vi.fn(),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  workspaceMemberRoles: { enum: { owner: "owner" } },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  workspaceMemberModel: { id: "id-column", workspaceId: "workspaceId-column" },
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: vi.fn(),
  likeContains: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({ withCache: vi.fn() }))

vi.mock("../src/user/service", () => ({
  userService: { findNameAndEmail: vi.fn() },
}))

vi.mock("../src/workspace-usage/service", () => ({
  workspaceUsageService: { increment: vi.fn(), decrement: vi.fn() },
}))

const { workspaceMemberService } = await import(
  "../src/workspace-member/service"
)

beforeEach(() => {
  findFirst.mockClear()
})

describe("workspaceMemberService.findByIdOrFail — cross-workspace isolation (IDOR)", () => {
  test("resolves a member scoped to its own workspace", async () => {
    const member = await workspaceMemberService.findByIdOrFail({
      id: "member-a",
      workspaceId: "workspace-a",
    })

    expect(member).toMatchObject({ id: "member-a" })
  })

  test("a member id that exists under a different workspace resolves not-found", async () => {
    await expect(
      workspaceMemberService.findByIdOrFail({
        id: "member-a",
        workspaceId: "workspace-b",
      }),
    ).rejects.toMatchObject({ code: "notFound" })

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "member-a",
          workspaceId: "workspace-b",
        }),
      }),
    )
  })
})

describe("workspaceMemberService.updateMember — cross-workspace isolation (IDOR)", () => {
  test("a member id that exists under a different workspace is never updated", async () => {
    await expect(
      workspaceMemberService.updateMember({
        id: "member-a",
        workspaceId: "workspace-b",
        data: { permissions: { superAdmin: true } },
      }),
    ).rejects.toMatchObject({ code: "notFound" })

    // `updateMember` must fail its existence check before ever issuing the
    // write — a service that skipped the workspace-scoped read and went
    // straight to `update(id, workspaceId)` could otherwise no-op silently
    // instead of surfacing the cross-workspace attempt.
    expect(db.update).not.toHaveBeenCalled()
  })
})
