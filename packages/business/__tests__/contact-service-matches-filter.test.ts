import { beforeEach, describe, expect, test, vi } from "vitest"

const { findFirst } = vi.hoisted(() => ({
  findFirst: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...args: unknown[]) => ({ __and: args })),
  db: {
    query: {
      contactModel: {
        findFirst,
      },
    },
  },
  eq: vi.fn((left: unknown, right: unknown) => ({ __eq: [left, right] })),
  findOrFail: vi.fn(),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({
    __inArray: [column, values],
  })),
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: vi.fn(),
}))

vi.mock("@chatbotx.io/events", () => ({
  emitContactCreated: vi.fn(),
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploadFileFromUrl: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
  withCache: vi.fn(),
}))

vi.mock("@chatbotx.io/analytics", () => ({
  macAnalyticsService: {},
}))

vi.mock("../src/quota-enforcement/service", () => ({
  quotaEnforcementService: {},
}))

vi.mock("../src/user-quota/service", () => ({
  userQuotaService: {},
}))

vi.mock("../src/workspace/service", () => ({
  workspaceService: {},
}))

const { contactService } = await import("../src/contact/service")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("contactService.matchesContactFilter", () => {
  test("returns false without querying when all conditions compile to no predicate", async () => {
    await expect(
      contactService.matchesContactFilter({
        workspaceId: "ws-1",
        contactId: "contact-1",
        contactFilter: {
          operator: "and",
          conditions: [
            {
              field: "deletedCustomField",
              operator: "eq",
              value: "x",
            },
          ],
        },
      }),
    ).resolves.toBe(false)

    expect(findFirst).not.toHaveBeenCalled()
  })

  test("queries the scoped contact when a valid predicate exists", async () => {
    findFirst.mockResolvedValue({ id: "contact-1" })

    await expect(
      contactService.matchesContactFilter({
        workspaceId: "ws-1",
        contactId: "contact-1",
        contactFilter: {
          operator: "and",
          conditions: [
            {
              field: "fullName",
              operator: "contains",
              value: "Ada",
            },
          ],
        },
      }),
    ).resolves.toBe(true)

    expect(findFirst).toHaveBeenCalledWith({
      columns: { id: true },
      where: expect.objectContaining({
        id: "contact-1",
        workspaceId: "ws-1",
      }),
    })
  })
})
