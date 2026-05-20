import { beforeEach, describe, expect, test, vi } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const findManyContacts = vi.fn()
const findManyTags = vi.fn()
const findManyCustomFields = vi.fn()
const updateSet = vi.fn()
const updateWhere = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      contactModel: {
        findMany: (...args: unknown[]) => findManyContacts(...args),
      },
      tagModel: {
        findMany: (...args: unknown[]) => findManyTags(...args),
      },
      customFieldModel: {
        findMany: (...args: unknown[]) => findManyCustomFields(...args),
      },
    },
    update: () => ({
      set: (values: unknown) => {
        updateSet(values)
        return { where: (cond: unknown) => updateWhere(cond) }
      },
    }),
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
}))

vi.mock("@chatbotx.io/database/partials", async () =>
  vi.importActual("@chatbotx.io/database/partials"),
)

vi.mock("@chatbotx.io/database/queries", () => ({
  applyContactFilter: (criteria: unknown) => ({ __filter: criteria }),
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
    createUpload: () => {
      const { PassThrough } = require("node:stream")
      const stream = new PassThrough()
      return { stream, done: Promise.resolve() }
    },
  },
}))

const { buildSelectedFields } = await import(
  "../src/default/handlers/export-contacts"
)

// ── Tests ─────────────────────────────────────────────────────────────────────

const WORKSPACE_ID = "ws-test"

beforeEach(() => {
  findManyTags.mockReset()
  findManyTags.mockResolvedValue([])
  findManyCustomFields.mockReset()
  findManyCustomFields.mockResolvedValue([])
})

describe("buildSelectedFields", () => {
  describe("contact fields (sys: prefix)", () => {
    test("resolves a known contact field to its display header without querying tag or custom-field models", async () => {
      // Arrange
      const fields = ["sys:fullName"]

      // Act
      const result = await buildSelectedFields(fields, WORKSPACE_ID)

      // Assert
      expect(result).toEqual([
        { type: "contact", value: "fullName", header: "Full Name" },
      ])
      expect(findManyTags).not.toHaveBeenCalled()
      expect(findManyCustomFields).not.toHaveBeenCalled()
    })

    test("falls back to the raw column name when the field key is not in headerNames", async () => {
      // Arrange
      const fields = ["sys:weirdCol"]

      // Act
      const result = await buildSelectedFields(fields, WORKSPACE_ID)

      // Assert
      expect(result).toEqual([
        { type: "contact", value: "weirdCol", header: "weirdCol" },
      ])
    })

    test("maps all known contact column keys to their correct display headers", async () => {
      // Arrange
      const cases: [string, string][] = [
        ["firstName", "First Name"],
        ["lastName", "Last Name"],
        ["fullName", "Full Name"],
        ["email", "Email"],
        ["phoneNumber", "Phone Number"],
        ["gender", "Gender"],
        ["source", "Source"],
        ["lastReadAt", "Last Read At"],
        ["blockedAt", "Blocked At"],
      ]

      for (const [value, expectedHeader] of cases) {
        // Act
        const result = await buildSelectedFields([`sys:${value}`], WORKSPACE_ID)

        // Assert
        expect(result).toEqual([
          { type: "contact", value, header: expectedHeader },
        ])
      }
    })
  })

  describe("unknown / unprefixed strings", () => {
    test("drops strings with no recognized prefix from the result", async () => {
      // Arrange
      const fields = ["noPrefix", "unknown:field", "justAWord"]

      // Act
      const result = await buildSelectedFields(fields, WORKSPACE_ID)

      // Assert
      expect(result).toHaveLength(0)
    })

    test("drops unprefixed strings while retaining valid adjacent fields", async () => {
      // Arrange
      const fields = ["garbage", "sys:email", "alsoGarbage"]

      // Act
      const result = await buildSelectedFields(fields, WORKSPACE_ID)

      // Assert
      expect(result).toEqual([
        { type: "contact", value: "email", header: "Email" },
      ])
    })
  })

  describe("tag fields (tag: prefix)", () => {
    test("resolves a tag id to the looked-up tag name as the header", async () => {
      // Arrange
      findManyTags.mockResolvedValueOnce([{ id: "t1", name: "VIP" }])

      // Act
      const result = await buildSelectedFields(["tag:t1"], WORKSPACE_ID)

      // Assert
      expect(result).toEqual([{ type: "tag", value: "t1", header: "VIP" }])
    })

    test("queries tagModel.findMany with the correct workspaceId in the where clause", async () => {
      // Arrange
      findManyTags.mockResolvedValueOnce([{ id: "t1", name: "VIP" }])

      // Act
      await buildSelectedFields(["tag:t1"], WORKSPACE_ID)

      // Assert
      expect(findManyTags).toHaveBeenCalledOnce()
      const callArg = findManyTags.mock.calls[0][0] as {
        where: { id: { in: string[] }; workspaceId: string }
      }
      expect(callArg.where.workspaceId).toBe(WORKSPACE_ID)
      expect(callArg.where.id.in).toContain("t1")
    })

    test("falls back to the raw tag id when no matching row is returned", async () => {
      // Arrange — findManyTags returns empty (already the default in beforeEach)

      // Act
      const result = await buildSelectedFields(["tag:unknownId"], WORKSPACE_ID)

      // Assert
      expect(result).toEqual([
        { type: "tag", value: "unknownId", header: "unknownId" },
      ])
    })

    test("does NOT call tagModel.findMany when there are no tag fields", async () => {
      // Arrange
      const fields = ["sys:email"]

      // Act
      await buildSelectedFields(fields, WORKSPACE_ID)

      // Assert
      expect(findManyTags).not.toHaveBeenCalled()
    })
  })

  describe("custom fields (cus: prefix)", () => {
    test("resolves a custom field id to the looked-up name as the header", async () => {
      // Arrange
      findManyCustomFields.mockResolvedValueOnce([{ id: "c1", name: "Plan" }])

      // Act
      const result = await buildSelectedFields(["cus:c1"], WORKSPACE_ID)

      // Assert
      expect(result).toEqual([{ type: "custom", value: "c1", header: "Plan" }])
    })

    test("queries customFieldModel.findMany with the correct workspaceId", async () => {
      // Arrange
      findManyCustomFields.mockResolvedValueOnce([{ id: "c1", name: "Plan" }])

      // Act
      await buildSelectedFields(["cus:c1"], WORKSPACE_ID)

      // Assert
      expect(findManyCustomFields).toHaveBeenCalledOnce()
      const callArg = findManyCustomFields.mock.calls[0][0] as {
        where: { id: { in: string[] }; workspaceId: string }
      }
      expect(callArg.where.workspaceId).toBe(WORKSPACE_ID)
      expect(callArg.where.id.in).toContain("c1")
    })

    test("falls back to the raw custom field id when no matching row is returned", async () => {
      // Arrange — findManyCustomFields returns empty (already the default in beforeEach)

      // Act
      const result = await buildSelectedFields(["cus:missingId"], WORKSPACE_ID)

      // Assert
      expect(result).toEqual([
        { type: "custom", value: "missingId", header: "missingId" },
      ])
    })

    test("does NOT call customFieldModel.findMany when there are no custom fields", async () => {
      // Arrange
      const fields = ["sys:email"]

      // Act
      await buildSelectedFields(fields, WORKSPACE_ID)

      // Assert
      expect(findManyCustomFields).not.toHaveBeenCalled()
    })
  })

  describe("mixed input", () => {
    test("preserves input order across contact, tag, and custom field types", async () => {
      // Arrange
      findManyTags.mockResolvedValueOnce([{ id: "t1", name: "VIP" }])
      findManyCustomFields.mockResolvedValueOnce([{ id: "c1", name: "Plan" }])

      // Act
      const result = await buildSelectedFields(
        ["sys:email", "tag:t1", "cus:c1"],
        WORKSPACE_ID,
      )

      // Assert
      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({
        type: "contact",
        value: "email",
        header: "Email",
      })
      expect(result[1]).toEqual({ type: "tag", value: "t1", header: "VIP" })
      expect(result[2]).toEqual({
        type: "custom",
        value: "c1",
        header: "Plan",
      })
    })

    test("drops unprefixed strings and retains valid fields with correct order", async () => {
      // Arrange
      findManyTags.mockResolvedValueOnce([{ id: "t2", name: "Premium" }])

      // Act
      const result = await buildSelectedFields(
        ["garbage", "sys:firstName", "tag:t2", "alsoGarbage"],
        WORKSPACE_ID,
      )

      // Assert
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        type: "contact",
        value: "firstName",
        header: "First Name",
      })
      expect(result[1]).toEqual({
        type: "tag",
        value: "t2",
        header: "Premium",
      })
    })

    test("handles an empty fields array and returns an empty result without querying", async () => {
      // Act
      const result = await buildSelectedFields([], WORKSPACE_ID)

      // Assert
      expect(result).toHaveLength(0)
      expect(findManyTags).not.toHaveBeenCalled()
      expect(findManyCustomFields).not.toHaveBeenCalled()
    })
  })
})
