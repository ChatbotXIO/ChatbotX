// @vitest-environment node
import { describe, expect, test, vi } from "vitest"

const { customFieldList, botFieldList, tagListActive } = vi.hoisted(() => ({
  customFieldList: vi.fn(),
  botFieldList: vi.fn(),
  tagListActive: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  customFieldService: { list: customFieldList },
  botFieldService: { list: botFieldList },
  tagService: { listActive: tagListActive },
}))

// Dynamic import (not a runtime-selected specifier): `vi.mock` above must
// register before the module under test is evaluated, so the import is
// deferred past the mock-setup statements — a static top-level import would
// load the real `@chatbotx.io/business` before the mock replaces it.
const { listContactFilterFieldsForAPI } = await import(
  "../list-contact-filter-fields"
)

describe("listContactFilterFieldsForAPI", () => {
  test("scopes every lookup by workspaceId", async () => {
    customFieldList.mockResolvedValue({ data: [] })
    botFieldList.mockResolvedValue({ data: [] })
    tagListActive.mockResolvedValue([])

    await listContactFilterFieldsForAPI({ workspaceId: "ws-1" })

    expect(customFieldList).toHaveBeenCalledWith({ workspaceId: "ws-1" })
    expect(botFieldList).toHaveBeenCalledWith({ workspaceId: "ws-1" })
    expect(tagListActive).toHaveBeenCalledWith({ workspaceId: "ws-1" })
  })

  test("excludes hidden static fields (e.g. legacy `locale`, `existingContact`)", async () => {
    customFieldList.mockResolvedValue({ data: [] })
    botFieldList.mockResolvedValue({ data: [] })
    tagListActive.mockResolvedValue([])

    const result = await listContactFilterFieldsForAPI({ workspaceId: "ws-1" })

    const fieldNames = result.staticFields.map(
      (f: { field: string }) => f.field,
    )
    expect(fieldNames).not.toContain("locale")
    expect(fieldNames).not.toContain("existingContact")
    expect(fieldNames).toContain("email")
    expect(fieldNames).toContain("tags")
  })

  test("each static field carries its enabled operator list", async () => {
    customFieldList.mockResolvedValue({ data: [] })
    botFieldList.mockResolvedValue({ data: [] })
    tagListActive.mockResolvedValue([])

    const result = await listContactFilterFieldsForAPI({ workspaceId: "ws-1" })

    const emailField = result.staticFields.find(
      (f: { field: string }) => f.field === "email",
    )
    expect(emailField?.operators).toEqual(
      expect.arrayContaining(["eq", "contains"]),
    )
  })

  test("derives each custom/bot field's valueType from its raw CustomFieldType", async () => {
    customFieldList.mockResolvedValue({
      data: [
        { id: "cf-1", name: "Company", type: "shortText" },
        { id: "cf-2", name: "Signup date", type: "date" },
      ],
    })
    botFieldList.mockResolvedValue({
      data: [{ id: "bf-1", name: "LastIntent", type: "number" }],
    })
    tagListActive.mockResolvedValue([{ id: "tag-1", name: "VIP" }])

    const result = await listContactFilterFieldsForAPI({ workspaceId: "ws-1" })

    expect(result.customFields).toEqual([
      { id: "cf-1", name: "Company", type: "shortText", valueType: "text" },
      {
        id: "cf-2",
        name: "Signup date",
        type: "date",
        valueType: "datetime",
      },
    ])
    expect(result.botFields).toEqual([
      { id: "bf-1", name: "LastIntent", type: "number", valueType: "number" },
    ])
    expect(result.tags).toEqual([{ id: "tag-1", name: "VIP" }])
  })
})
