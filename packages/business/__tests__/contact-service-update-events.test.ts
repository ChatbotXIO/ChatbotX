import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockDbUpdate, mockEmitContactInfoUpdated } = vi.hoisted(() => ({
  mockDbUpdate: vi.fn(),
  mockEmitContactInfoUpdated: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...args: unknown[]) => ({ __and: args })),
  db: { update: mockDbUpdate },
  eq: vi.fn((left: unknown, right: unknown) => ({ __eq: [left, right] })),
  findOrFail: vi.fn(),
  inArray: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/database/schema")>()
  return actual
})

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: vi.fn(),
}))

vi.mock("@chatbotx.io/events", () => ({
  emitContactCreated: vi.fn(),
  emitContactInfoUpdated: mockEmitContactInfoUpdated,
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

const buildUpdateClient = (updated: {
  id: string
  workspaceId: string
  phoneNumber: string | null
  email: string | null
}) => {
  const returning = vi.fn().mockResolvedValue([updated])
  const where = vi.fn(() => ({ returning }))
  const set = vi.fn(() => ({ where }))
  const update = vi.fn(() => ({ set }))

  return { returning, set, update, where }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("contactService.update contactInfoUpdated events", () => {
  test("emits contact info changes on the autocommit path", async () => {
    const existing = {
      id: "contact-1",
      workspaceId: "ws-1",
      phoneNumber: "+84900000000",
      email: null,
    }
    const updated = {
      ...existing,
      phoneNumber: "+84912345678",
    }
    const dbUpdateClient = buildUpdateClient(updated)
    mockDbUpdate.mockImplementation(dbUpdateClient.update)
    vi.spyOn(contactService, "findByIdOrFail").mockResolvedValue(
      existing as never,
    )
    vi.spyOn(contactService, "invalidate").mockResolvedValue(undefined)

    await contactService.update(
      { workspaceId: "ws-1", id: "contact-1" },
      { phoneNumber: "+84912345678" },
    )

    expect(mockEmitContactInfoUpdated).toHaveBeenCalledExactlyOnceWith(
      "ws-1",
      "contact-1",
      "phone",
      "+84900000000",
      "+84912345678",
    )
  })

  test("does not emit before a caller-owned transaction commits", async () => {
    const existing = {
      id: "contact-1",
      workspaceId: "ws-1",
      phoneNumber: "+84900000000",
      email: null,
    }
    const updated = {
      ...existing,
      phoneNumber: "+84912345678",
    }
    const txUpdateClient = buildUpdateClient(updated)
    const tx = { update: txUpdateClient.update }
    vi.spyOn(contactService, "findByIdOrFail").mockResolvedValue(
      existing as never,
    )
    vi.spyOn(contactService, "invalidate").mockResolvedValue(undefined)

    await contactService.update(
      { workspaceId: "ws-1", id: "contact-1" },
      { phoneNumber: "+84912345678" },
      tx as never,
    )

    expect(mockEmitContactInfoUpdated).not.toHaveBeenCalled()
  })
})
