// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest"

const { customFieldList, botFieldList, tagListActive, activityFilters } =
  vi.hoisted(() => ({
    customFieldList: vi.fn(),
    botFieldList: vi.fn(),
    tagListActive: vi.fn(),
    activityFilters: { enabled: true },
  }))

vi.mock("@chatbotx.io/database/queries/contact-filter", () => ({
  isContactActivityFiltersEnabled: () => activityFilters.enabled,
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
  test("lists the flow-only working-hours field on the flowCondition surface only", async () => {
    customFieldList.mockResolvedValue({ data: [] })
    botFieldList.mockResolvedValue({ data: [] })
    tagListActive.mockResolvedValue([])

    const names = async (surface?: "contacts" | "flowCondition") =>
      (
        await listContactFilterFieldsForAPI({ workspaceId: "ws-1", surface })
      ).staticFields.map((f: { field: string }) => f.field)

    expect(await names()).not.toContain("isWithinWorkingHours")
    expect(await names("contacts")).not.toContain("isWithinWorkingHours")
    expect(await names("flowCondition")).toContain("isWithinWorkingHours")
    expect(await names("flowCondition")).toContain("email")
  })

  describe("activity-backed fields", () => {
    const list = async () => {
      customFieldList.mockResolvedValue({ data: [] })
      botFieldList.mockResolvedValue({ data: [] })
      tagListActive.mockResolvedValue([])
      return await listContactFilterFieldsForAPI({ workspaceId: "ws-1" })
    }
    const find = (result: Awaited<ReturnType<typeof list>>, field: string) =>
      result.staticFields.find((f: { field: string }) => f.field === field)

    afterEach(() => {
      activityFilters.enabled = true
    })

    test("tells an agent where each field's values come from", async () => {
      const result = await list()

      expect(find(result, "executedFlow")?.valueSource).toMatchObject({
        operation: "flows.list",
        scope: "automation",
        fixedValues: [],
        valueFormat: "id",
      })
      expect(find(result, "executedStep")?.valueSource).toMatchObject({
        operation: "flows.listNodes",
        scope: "automation",
        valueFormat: "flowId:nodeId",
      })
      expect(find(result, "keywordsReceived")?.valueSource?.operation).toBe(
        "keywords.list",
      )
      expect(
        find(result, "completedWhatsAppFlows")?.valueSource?.operation,
      ).toBe("whatsappFlows.list")
      expect(find(result, "emailOpened")?.valueSource).toMatchObject({
        operation: "emailTopics.list",
        scope: "broadcasts",
        fixedValues: ["noTopic"],
      })
    })

    test("free-form tracked fields carry only their format and baseline", async () => {
      const result = await list()

      expect(find(result, "sentMessage")?.valueSource).toMatchObject({
        fixedValues: [],
        valueFormat: "text",
      })
      expect(
        find(result, "sentMessage")?.valueSource?.operation,
      ).toBeUndefined()
      expect(find(result, "lastDelivered")?.valueSource?.valueFormat).toBe(
        "datetime",
      )
    })

    test("reports when tracking began for every tracked field (no backfill)", async () => {
      const result = await list()

      for (const field of [
        "executedFlow",
        "executedStep",
        "keywordsReceived",
        "completedWhatsAppFlows",
        "emailSent",
        "emailDelivered",
        "emailOpened",
        "emailClicked",
        "sentMessage",
        "lastDelivered",
      ]) {
        const trackingStartedAt = find(result, field)?.valueSource
          ?.trackingStartedAt
        expect(trackingStartedAt).toBeDefined()
        expect(Number.isNaN(Date.parse(trackingStartedAt ?? ""))).toBe(false)
      }
    })

    test("other fields have no valueSource", async () => {
      const result = await list()

      expect(find(result, "tags")?.valueSource).toBeUndefined()
      expect(find(result, "email")?.valueSource).toBeUndefined()
    })

    test("lists the same operators the schema validates", async () => {
      const result = await list()

      expect(find(result, "executedFlow")?.operators).toEqual(
        expect.arrayContaining(["in", "notIn", "eq", "ne", "isEmpty"]),
      )
      expect(find(result, "lastDelivered")?.operators).toEqual(
        expect.arrayContaining(["isNotEmpty", "isBetween"]),
      )
    })

    test("omits every tracked field when the kill switch is off", async () => {
      activityFilters.enabled = false
      const result = await list()
      const names = result.staticFields.map((f: { field: string }) => f.field)

      for (const field of [
        "executedFlow",
        "executedStep",
        "keywordsReceived",
        "completedWhatsAppFlows",
        "emailSent",
        "emailDelivered",
        "emailOpened",
        "emailClicked",
        "sentMessage",
        "lastDelivered",
      ]) {
        expect(names).not.toContain(field)
      }
      expect(names).toContain("tags")
    })
  })
})
