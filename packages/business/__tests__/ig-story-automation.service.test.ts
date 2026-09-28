import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findInbox: vi.fn(), insertValues: vi.fn() }))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      igStoryAutomationModel: { findMany: mocks.findMany },
      inboxModel: { findFirst: mocks.findInbox },
    },
    insert: vi.fn(() => ({ values: mocks.insertValues })),
  },
  and: (...conditions: unknown[]) => ({ and: conditions }),
  eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
  inArray: (column: unknown, values: unknown[]) => ({ inArray: [column, values] }),
  isNull: (column: unknown) => ({ isNull: column }),
  or: (...conditions: unknown[]) => ({ or: conditions }),
  relationsFilterToSQL: vi.fn((_table: unknown, where: unknown) => where),
  sql: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  igStoryAutomationModel: {
    id: "IgStoryAutomation.id",
    workspaceId: "IgStoryAutomation.workspaceId",
    type: "IgStoryAutomation.type",
    inboxId: "IgStoryAutomation.inboxId",
  },
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  igStoryAutomationTypes: { options: ["instagram", "instagramFacebook"] },
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: vi.fn(() => ({ limit: 10, offset: 0 })),
  likeContains: vi.fn(),
  parseOrderByAsObject: vi.fn(),
}))

vi.mock("@chatbotx.io/utils", () => ({ createId: vi.fn() }))

const { igStoryAutomationService } = await import(
  "../src/ig-story-automation/service"
)

describe("igStoryAutomationService active scope", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findInbox.mockResolvedValue({ id: "inbox-a", workspaceId: "workspace-1", channel: "instagram" })
    mocks.insertValues.mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "story-1" }]) })
  })

  test("returns only same-inbox and legacy active rows", async () => {
    const rows = [
      { id: "a", workspaceId: "workspace-1", type: "instagram", isActive: true, inboxId: "inbox-a" },
      { id: "b", workspaceId: "workspace-1", type: "instagram", isActive: true, inboxId: "inbox-b" },
      { id: "legacy", workspaceId: "workspace-1", type: "instagram", isActive: true, inboxId: null },
      { id: "wrong-workspace", workspaceId: "workspace-2", type: "instagram", isActive: true, inboxId: "inbox-a" },
      { id: "wrong-type", workspaceId: "workspace-1", type: "instagramFacebook", isActive: true, inboxId: "inbox-a" },
      { id: "inactive", workspaceId: "workspace-1", type: "instagram", isActive: false, inboxId: "inbox-a" },
    ]
    mocks.findMany.mockImplementation(({ where }) =>
      rows.filter(
        (row) =>
          row.workspaceId === where.workspaceId &&
          row.type === where.type &&
          row.isActive === where.isActive &&
          where.inboxId.OR.some((condition: { isNull?: boolean; eq?: string }) =>
            condition.isNull === true
              ? row.inboxId === null
              : row.inboxId === condition.eq,
          ),
      ),
    )

    const result = await igStoryAutomationService.findActiveAutomations({
      workspaceId: "workspace-1",
      channelType: "instagram",
      inboxId: "inbox-a",
    })

    expect(result).toEqual([rows[0], rows[2]])
  })

  test("rejects foreign story inbox and accepts null scope", async () => {
    mocks.findInbox.mockResolvedValue(null)
    await expect(
      igStoryAutomationService.create({
        workspaceId: "workspace-1",
        type: "instagram",
        data: { inboxId: "foreign-inbox" } as never,
      }),
    ).rejects.toMatchObject({ field: "inboxId" })

    await expect(
      igStoryAutomationService.create({
        workspaceId: "workspace-1",
        type: "instagram",
        data: { inboxId: null } as never,
      }),
    ).resolves.toEqual({ id: "story-1" })
  })
})
