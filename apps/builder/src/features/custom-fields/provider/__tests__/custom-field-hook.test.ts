import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import { describe, expect, test } from "vitest"
import { buildGroupedFieldOptions } from "../custom-field-hook"

const option = (value: string): SelectOption => ({ value, label: value })

describe("buildGroupedFieldOptions", () => {
  test("returns one group per non-empty section, in system/custom/account order", () => {
    const groups = buildGroupedFieldOptions({
      systemFields: { label: "System Fields", options: [option("first_name")] },
      customFields: {
        label: "Custom Fields",
        options: [option("1"), option("2")],
      },
      accountFields: {
        label: "Account Fields",
        options: [option("bot_field:1")],
      },
    })

    expect(groups).toHaveLength(3)
    expect(groups[0]?.label).toBe("System Fields")
    expect(groups[0]?.children).toEqual([option("first_name")])
    expect(groups[1]?.label).toBe("Custom Fields")
    expect(groups[1]?.children).toEqual([option("1"), option("2")])
    expect(groups[2]?.label).toBe("Account Fields")
    expect(groups[2]?.children).toEqual([option("bot_field:1")])
  })

  test("omits a group entirely when it has no options", () => {
    const groups = buildGroupedFieldOptions({
      systemFields: { label: "System Fields", options: [] },
      customFields: { label: "Custom Fields", options: [option("1")] },
      accountFields: { label: "Account Fields", options: [] },
    })

    expect(groups).toHaveLength(1)
    expect(groups[0]?.label).toBe("Custom Fields")
  })

  test("returns an empty array when every section is empty", () => {
    const groups = buildGroupedFieldOptions({
      systemFields: { label: "System Fields", options: [] },
      customFields: { label: "Custom Fields", options: [] },
      accountFields: { label: "Account Fields", options: [] },
    })

    expect(groups).toEqual([])
  })

  test("each group option carries a unique value so React keys never collide", () => {
    const groups = buildGroupedFieldOptions({
      systemFields: { label: "System Fields", options: [option("a")] },
      customFields: { label: "Custom Fields", options: [option("b")] },
      accountFields: { label: "Account Fields", options: [option("c")] },
    })

    const values = groups.map((group) => group.value)
    expect(new Set(values).size).toBe(values.length)
  })
})
