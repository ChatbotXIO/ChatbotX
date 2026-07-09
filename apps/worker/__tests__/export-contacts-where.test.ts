import { beforeEach, describe, expect, test, vi } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────
// Replicate the same vi.mock(...) block used in export-contacts-handler.test.ts
// so that the top-level imports in export-contacts.ts never crash on env.

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      contactModel: { findMany: vi.fn() },
      tagModel: { findMany: vi.fn() },
      customFieldModel: { findMany: vi.fn() },
    },
    update: () => ({
      set: () => ({ where: vi.fn() }),
    }),
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
}))

vi.mock("@chatbotx.io/database/partials", async () =>
  vi.importActual("@chatbotx.io/database/partials"),
)

const applyContactFilterSpy = vi.fn((criteria: unknown) => ({
  __filter: criteria,
}))

vi.mock("@chatbotx.io/database/queries", () => ({
  applyContactFilter: (criteria: unknown) => applyContactFilterSpy(criteria),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactCustomFieldModel: {},
  fileModel: { id: "File.id", workspaceId: "File.workspaceId" },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  loopableItemsCount: 2,
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: {
    createUpload: vi.fn(),
  },
}))

const { buildBaseWhere } = await import(
  "../src/default/handlers/export-contacts"
)
const { stripContactPIIFields } = await import(
  "@chatbotx.io/worker-config/contact-pii"
)

// ── Type helpers ──────────────────────────────────────────────────────────────

type BuildBaseWhereInput = Parameters<typeof buildBaseWhere>[0]

const buildData = (
  overrides: Partial<BuildBaseWhereInput> = {},
): BuildBaseWhereInput =>
  ({
    requestedUserId: "user-1",
    workspaceId: "ws-1",
    fileId: "file-1",
    fields: ["sys:email"],
    // The real producer always sets this; PII export fails closed when omitted.
    canExportEmailAndPhone: true,
    outputPath: "exports/ws-1/contacts.csv",
    outputFormat: "csv",
    contactIds: ["c-1", "c-2"],
    ...overrides,
  }) as BuildBaseWhereInput

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  applyContactFilterSpy.mockClear()
  applyContactFilterSpy.mockImplementation((criteria: unknown) => ({
    __filter: criteria,
  }))
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("buildBaseWhere", () => {
  describe("no filter supplied", () => {
    test("where contains workspaceId and id.in with the given contactIds", () => {
      // Arrange
      const data = buildData({ contactIds: ["c-1", "c-2"], filter: undefined })

      // Act
      const where = buildBaseWhere(data)

      // Assert
      expect(where.workspaceId).toBe("ws-1")
      expect(where.id).toEqual({ in: ["c-1", "c-2"] })
    })

    test("where does not contain an OR clause when filter is undefined", () => {
      // Arrange
      const data = buildData({ filter: undefined })

      // Act
      const where = buildBaseWhere(data)

      // Assert
      expect(where).not.toHaveProperty("OR")
    })

    test("where includes assigned-user relation scope when provided", () => {
      // Arrange
      const data = buildData({
        filter: undefined,
        restrictToAssignedUserId: "user-1",
      })

      // Act
      const where = buildBaseWhere(data)

      // Assert
      expect(where.conversation).toEqual({ assignedUserId: "user-1" })
    })
  })

  describe("filter with keyword only", () => {
    test("where contains workspaceId and a 4-element OR array", () => {
      // Arrange
      const data = buildData({
        contactIds: undefined,
        filter: { keyword: "hello" },
      })

      // Act
      const where = buildBaseWhere(data)

      // Assert
      expect(where.workspaceId).toBe("ws-1")
      const or = where.OR as unknown[]
      expect(Array.isArray(or)).toBe(true)
      expect(or).toHaveLength(4)
    })

    test("OR array covers firstName, lastName, email, and phoneNumber ilike conditions", () => {
      // Arrange
      const data = buildData({ filter: { keyword: "hello" } })

      // Act
      const where = buildBaseWhere(data)

      // Assert
      const or = where.OR as { [field: string]: { ilike: string } }[]
      expect(or[0]).toEqual({ firstName: { ilike: "%hello%" } })
      expect(or[1]).toEqual({ lastName: { ilike: "%hello%" } })
      expect(or[2]).toEqual({ email: { ilike: "%hello%" } })
      expect(or[3]).toEqual({ phoneNumber: { ilike: "%hello%" } })
    })

    test("OR array omits email and phoneNumber when PII export is denied", () => {
      // Arrange
      const data = buildData({
        filter: { keyword: "hello" },
        canExportEmailAndPhone: false,
      })

      // Act
      const where = buildBaseWhere(data)

      // Assert
      expect(where.OR).toEqual([
        { firstName: { ilike: "%hello%" } },
        { lastName: { ilike: "%hello%" } },
      ])
    })

    test("OR array omits email and phoneNumber when PII flag is omitted (fails closed)", () => {
      // Arrange
      const data = buildData({
        filter: { keyword: "hello" },
        canExportEmailAndPhone: undefined,
      })

      // Act
      const where = buildBaseWhere(data)

      // Assert
      expect(where.OR).toEqual([
        { firstName: { ilike: "%hello%" } },
        { lastName: { ilike: "%hello%" } },
      ])
    })

    test("where does not contain an id key when filter is present", () => {
      // Arrange
      const data = buildData({ filter: { keyword: "hello" } })

      // Act
      const where = buildBaseWhere(data)

      // Assert
      expect(where).not.toHaveProperty("id")
    })

    test("keyword is lowercased and %-wrapped in ilike values (AcMe -> %acme%)", () => {
      // Arrange
      const data = buildData({ filter: { keyword: "AcMe" } })

      // Act
      const where = buildBaseWhere(data)

      // Assert
      const or = where.OR as { [field: string]: { ilike: string } }[]
      for (const condition of or) {
        const ilike = Object.values(condition)[0].ilike
        expect(ilike).toBe("%acme%")
      }
    })
  })

  describe("filter with contactFilter only", () => {
    test("applyContactFilter is called with the given criteria", () => {
      // Arrange
      const criteria = { operator: "and" as const, conditions: [] }
      const data = buildData({ filter: { contactFilter: criteria } })

      // Act
      buildBaseWhere(data)

      // Assert
      expect(applyContactFilterSpy).toHaveBeenCalledOnce()
      expect(applyContactFilterSpy).toHaveBeenCalledWith(criteria)
    })

    test("result of applyContactFilter is merged into where", () => {
      // Arrange
      const criteria = { operator: "and" as const, conditions: [] }
      const data = buildData({ filter: { contactFilter: criteria } })

      // Act
      const where = buildBaseWhere(data)

      // Assert
      expect(where.__filter).toEqual(criteria)
    })

    test("where does not contain an OR clause when no keyword is given", () => {
      // Arrange
      const data = buildData({
        filter: { contactFilter: { operator: "and" as const, conditions: [] } },
      })

      // Act
      const where = buildBaseWhere(data)

      // Assert
      expect(where).not.toHaveProperty("OR")
    })

    test("assigned-user scope merges with contact filter conversation clauses", () => {
      // Arrange
      const criteria = { operator: "and" as const, conditions: [] }
      applyContactFilterSpy.mockReturnValueOnce({
        conversation: { botEnabled: false },
      })
      const data = buildData({
        filter: { contactFilter: criteria },
        restrictToAssignedUserId: "user-1",
      })

      // Act
      const where = buildBaseWhere(data)

      // Assert
      expect(where.conversation).toEqual({
        botEnabled: false,
        assignedUserId: "user-1",
      })
    })
  })

  describe("filter with both keyword and contactFilter", () => {
    test("where contains workspaceId, OR array, and merged applyContactFilter result", () => {
      // Arrange
      const criteria = { operator: "or" as const, conditions: [] }
      const data = buildData({
        filter: {
          keyword: "acme",
          contactFilter: criteria,
        },
      })

      // Act
      const where = buildBaseWhere(data)

      // Assert
      expect(where.workspaceId).toBe("ws-1")
      expect(Array.isArray(where.OR)).toBe(true)
      expect(where.__filter).toEqual(criteria)
    })

    test("applyContactFilter is called exactly once with the criteria", () => {
      // Arrange
      const criteria = { operator: "or" as const, conditions: [] }
      const data = buildData({
        filter: { keyword: "test", contactFilter: criteria },
      })

      // Act
      buildBaseWhere(data)

      // Assert
      expect(applyContactFilterSpy).toHaveBeenCalledOnce()
      expect(applyContactFilterSpy).toHaveBeenCalledWith(criteria)
    })

    test("ilike values include the lowercased %-wrapped keyword even when contactFilter is also set", () => {
      // Arrange
      const data = buildData({
        filter: {
          keyword: "UPPER",
          contactFilter: { operator: "and" as const, conditions: [] },
        },
      })

      // Act
      const where = buildBaseWhere(data)

      // Assert
      const or = where.OR as { [field: string]: { ilike: string } }[]
      for (const condition of or) {
        const ilike = Object.values(condition)[0].ilike
        expect(ilike).toBe("%upper%")
      }
    })
  })

  // "Export all" requests reach the worker as an empty filter object (the
  // action maps exportAll into { keyword: undefined, contactFilter: undefined }).
  describe("export-all empty filter", () => {
    test("where is workspaceId only for an empty filter object", () => {
      // Arrange
      const data = buildData({ contactIds: undefined, filter: {} })

      // Act
      const where = buildBaseWhere(data)

      // Assert
      expect(where).toEqual({ workspaceId: "ws-1" })
    })

    test("where omits id and OR for a filter with undefined keyword and contactFilter", () => {
      // Arrange
      const data = buildData({
        contactIds: undefined,
        filter: { keyword: undefined, contactFilter: undefined },
      })

      // Act
      const where = buildBaseWhere(data)

      // Assert
      expect(where).not.toHaveProperty("id")
      expect(where).not.toHaveProperty("OR")
    })

    test("an empty filter ignores contactIds rather than scoping by id", () => {
      // Arrange
      const data = buildData({ contactIds: ["c-1", "c-2"], filter: {} })

      // Act
      const where = buildBaseWhere(data)

      // Assert
      expect(where).not.toHaveProperty("id")
      expect(applyContactFilterSpy).not.toHaveBeenCalled()
    })
  })
})

describe("stripContactPIIFields", () => {
  test("removes email and phoneNumber fields when PII export is denied", () => {
    expect(
      stripContactPIIFields(
        ["sys:firstName", "sys:email", "sys:phoneNumber", "tag:t1"],
        false,
      ),
    ).toEqual(["sys:firstName", "tag:t1"])
  })

  test("preserves fields when PII export is allowed", () => {
    expect(
      stripContactPIIFields(["sys:email", "sys:phoneNumber"], true),
    ).toEqual(["sys:email", "sys:phoneNumber"])
  })
})
