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

  test("passes through workspace custom fields, bot fields, and tags", async () => {
    customFieldList.mockResolvedValue({
      data: [{ id: "cf-1", name: "Company", type: "text" }],
    })
    botFieldList.mockResolvedValue({
      data: [{ id: "bf-1", name: "LastIntent", type: "text" }],
    })
    tagListActive.mockResolvedValue([{ id: "tag-1", name: "VIP" }])

    const result = await listContactFilterFieldsForAPI({ workspaceId: "ws-1" })

    expect(result.customFields).toEqual([
      { id: "cf-1", name: "Company", type: "text" },
    ])
    expect(result.botFields).toEqual([
      { id: "bf-1", name: "LastIntent", type: "text" },
    ])
    expect(result.tags).toEqual([{ id: "tag-1", name: "VIP" }])
  })
})
