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
  isNull: vi.fn((value: unknown) => ({ __isNull: value })),
  or: vi.fn((...args: unknown[]) => ({ __or: args })),
  sql: vi.fn(),
}))

vi.mock(
  "@chatbotx.io/database/schema",
  async (importOriginal) =>
    await importOriginal<typeof import("@chatbotx.io/database/schema")>(),
)

vi.mock("@chatbotx.io/event-bus", () => ({ emit: vi.fn() }))
vi.mock("@chatbotx.io/events", () => ({
  emitContactCreated: vi.fn(),
  emitContactInfoUpdated: mockEmitContactInfoUpdated,
}))
vi.mock("@chatbotx.io/filesystem", () => ({ uploadFileFromUrl: vi.fn() }))
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
  withCache: vi.fn(),
}))
vi.mock("@chatbotx.io/analytics", () => ({ macAnalyticsService: {} }))
vi.mock("../src/quota-enforcement/service", () => ({
  quotaEnforcementService: {},
}))
vi.mock("../src/user-quota/service", () => ({ userQuotaService: {} }))
vi.mock("../src/workspace/service", () => ({ workspaceService: {} }))

const { contactService } = await import("../src/contact/service")
const {
  and: andMock,
  eq: eqMock,
  isNull: isNullMock,
  or: orMock,
} = await import("@chatbotx.io/database/client")

const buildUpdateClient = (returningResult: unknown[]) => {
  const returning = vi.fn().mockResolvedValue(returningResult)
  const where = vi.fn(() => ({ returning }))
  const set = vi.fn(() => ({ where }))
  const update = vi.fn(() => ({ set }))
  return { returning, set, update, where }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("contactService.adoptPhoneNumberIfSafe", () => {
  test.each([
    { storedPhone: null, adoptedPhone: "84900000002" },
    { storedPhone: "", adoptedPhone: "84900000002" },
    { storedPhone: "+84900000001", adoptedPhone: "+84900000002" },
    { storedPhone: "84900000001", adoptedPhone: "84900000002" },
  ])("atomically adopts the phone when the stored value is $storedPhone", async ({
    storedPhone,
    adoptedPhone,
  }) => {
    const existing = {
      id: "contact-1",
      workspaceId: "workspace-1",
      phoneNumber: storedPhone,
      email: null,
    }
    const updated = { ...existing, phoneNumber: adoptedPhone }
    const dbUpdateClient = buildUpdateClient([updated])
    mockDbUpdate.mockImplementation(dbUpdateClient.update)
    vi.spyOn(contactService, "findByIdOrFail").mockResolvedValue(
      existing as never,
    )
    const invalidateSpy = vi
      .spyOn(contactService, "invalidate")
      .mockResolvedValue(undefined)

    await expect(
      contactService.adoptPhoneNumberIfSafe({
        workspaceId: "workspace-1",
        id: "contact-1",
        previousPhone: "84900000001",
        newPhone: "84900000002",
      }),
    ).resolves.toEqual(updated)

    expect(dbUpdateClient.set).toHaveBeenCalledWith({
      phoneNumber: adoptedPhone,
    })
    expect(eqMock).toHaveBeenCalledWith(expect.anything(), "contact-1")
    expect(eqMock).toHaveBeenCalledWith(expect.anything(), "workspace-1")
    expect(andMock).toHaveBeenCalledTimes(1)
    expect(orMock).not.toHaveBeenCalled()
    if (storedPhone === null) {
      expect(isNullMock).toHaveBeenCalledWith(expect.anything())
    } else {
      expect(eqMock).toHaveBeenCalledWith(expect.anything(), storedPhone)
    }
    expect(invalidateSpy).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ids: ["contact-1"],
    })
    expect(mockEmitContactInfoUpdated).toHaveBeenCalledWith(
      "workspace-1",
      "contact-1",
      "phone",
      storedPhone || null,
      adoptedPhone,
    )
  })

  test("skips a stored phone whose digits differ from the previous phone", async () => {
    vi.spyOn(contactService, "findByIdOrFail").mockResolvedValue({
      id: "contact-1",
      workspaceId: "workspace-1",
      phoneNumber: "+84888888888",
      email: null,
    } as never)

    await expect(
      contactService.adoptPhoneNumberIfSafe({
        workspaceId: "workspace-1",
        id: "contact-1",
        previousPhone: "84900000001",
        newPhone: "84900000002",
      }),
    ).resolves.toBeUndefined()

    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  test("does not overwrite a non-empty phone when no previous phone is known", async () => {
    vi.spyOn(contactService, "findByIdOrFail").mockResolvedValue({
      id: "contact-1",
      workspaceId: "workspace-1",
      phoneNumber: "+84888888888",
      email: null,
    } as never)

    await expect(
      contactService.adoptPhoneNumberIfSafe({
        workspaceId: "workspace-1",
        id: "contact-1",
        newPhone: "84900000002",
      }),
    ).resolves.toBeUndefined()

    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  test("uses an exact empty-string guard when no previous phone is known", async () => {
    const existing = {
      id: "contact-1",
      workspaceId: "workspace-1",
      phoneNumber: "",
      email: null,
    }
    const dbUpdateClient = buildUpdateClient([])
    mockDbUpdate.mockImplementation(dbUpdateClient.update)
    vi.spyOn(contactService, "findByIdOrFail").mockResolvedValue(
      existing as never,
    )
    const invalidateSpy = vi
      .spyOn(contactService, "invalidate")
      .mockResolvedValue(undefined)

    await expect(
      contactService.adoptPhoneNumberIfSafe({
        workspaceId: "workspace-1",
        id: "contact-1",
        newPhone: "84900000002",
      }),
    ).resolves.toBeUndefined()

    expect(eqMock).toHaveBeenCalledWith(expect.anything(), "")
    expect(invalidateSpy).not.toHaveBeenCalled()
    expect(mockEmitContactInfoUpdated).not.toHaveBeenCalled()
  })

  test.each([
    { concurrentPhone: null, transition: "non-empty to NULL" },
    { concurrentPhone: "", transition: "non-empty to empty" },
  ])("skips side effects when a concurrent $transition write defeats the exact-value guard", async () => {
    const dbUpdateClient = buildUpdateClient([])
    mockDbUpdate.mockImplementation(dbUpdateClient.update)
    vi.spyOn(contactService, "findByIdOrFail").mockResolvedValue({
      id: "contact-1",
      workspaceId: "workspace-1",
      phoneNumber: "+84900000001",
      email: null,
    } as never)
    const invalidateSpy = vi
      .spyOn(contactService, "invalidate")
      .mockResolvedValue(undefined)

    await expect(
      contactService.adoptPhoneNumberIfSafe({
        workspaceId: "workspace-1",
        id: "contact-1",
        previousPhone: "84900000001",
        newPhone: "84900000002",
      }),
    ).resolves.toBeUndefined()

    expect(orMock).not.toHaveBeenCalled()
    expect(eqMock).toHaveBeenCalledWith(expect.anything(), "+84900000001")
    expect(invalidateSpy).not.toHaveBeenCalled()
    expect(mockEmitContactInfoUpdated).not.toHaveBeenCalled()
  })
})
