import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockBackdateCreatedAt, mockInvalidateCacheByTags } = vi.hoisted(() => ({
  mockBackdateCreatedAt: vi.fn(),
  mockInvalidateCacheByTags: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn(),
  db: {},
  eq: vi.fn(),
  findOrFail: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}))
vi.mock(
  "@chatbotx.io/database/schema",
  async (importOriginal) =>
    await importOriginal<typeof import("@chatbotx.io/database/schema")>(),
)
vi.mock("@chatbotx.io/database/repositories", () => ({
  contactRepository: { backdateCreatedAt: mockBackdateCreatedAt },
}))
vi.mock("@chatbotx.io/event-bus", () => ({ emit: vi.fn() }))
vi.mock("@chatbotx.io/events", () => ({
  emitContactCreated: vi.fn(),
  emitContactInfoUpdated: vi.fn(),
}))
vi.mock("@chatbotx.io/filesystem", () => ({ uploadFileFromUrl: vi.fn() }))
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mockInvalidateCacheByTags,
  withCache: vi.fn(),
}))
vi.mock("@chatbotx.io/analytics", () => ({ macAnalyticsService: {} }))
vi.mock("../src/quota-enforcement/service", () => ({
  quotaEnforcementService: {},
}))
vi.mock("../src/user-quota/service", () => ({ userQuotaService: {} }))
vi.mock("../src/workspace/service", () => ({ workspaceService: {} }))

const { contactService } = await import("../src/contact/service")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("contactService.backdateCreatedAt", () => {
  const createdAt = new Date("2025-01-01T00:00:00.000Z")

  test("skips the repository and the cache with no rows", async () => {
    await contactService.backdateCreatedAt({ workspaceId: "ws-1", rows: [] })

    expect(mockBackdateCreatedAt).not.toHaveBeenCalled()
    expect(mockInvalidateCacheByTags).not.toHaveBeenCalled()
  })

  // Coexist chunks replay the same contacts batch after batch; a contact the
  // SQL left untouched must not cost a Redis round trip.
  test("invalidates only the contacts the statement actually changed", async () => {
    mockBackdateCreatedAt.mockResolvedValue(["contact-2"])

    await contactService.backdateCreatedAt({
      workspaceId: "ws-1",
      rows: [
        { contactId: "contact-1", createdAt },
        { contactId: "contact-2", createdAt },
      ],
    })

    expect(mockBackdateCreatedAt).toHaveBeenCalledWith([
      { contactId: "contact-1", workspaceId: "ws-1", createdAt },
      { contactId: "contact-2", workspaceId: "ws-1", createdAt },
    ])
    expect(mockInvalidateCacheByTags).toHaveBeenCalledTimes(1)
    expect(mockInvalidateCacheByTags).toHaveBeenCalledWith([
      "contacts",
      "contacts:ws-1",
      "contacts:contact-2",
    ])
  })

  test("does not touch the cache when nothing changed", async () => {
    mockBackdateCreatedAt.mockResolvedValue([])

    await contactService.backdateCreatedAt({
      workspaceId: "ws-1",
      rows: [{ contactId: "contact-1", createdAt }],
    })

    expect(mockInvalidateCacheByTags).not.toHaveBeenCalled()
  })
})
