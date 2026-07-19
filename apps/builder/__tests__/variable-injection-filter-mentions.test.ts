import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import { describe, expect, it } from "vitest"
import { getFilteredMentions } from "@/components/tiptap/extensions/variable-injection/filter-mentions"

const VARIABLES: SelectOption[] = [
  { label: "Full name", value: "full_name" },
  { label: "First name", value: "first_name" },
  { label: "Email", value: "email" },
]

const valuesOf = (options: SelectOption[]) =>
  options.map((option) => option.value)

describe("getFilteredMentions", () => {
  it("returns every variable for an empty query", () => {
    expect(getFilteredMentions("", VARIABLES)).toHaveLength(VARIABLES.length)
  })

  it("matches on the display label", () => {
    expect(valuesOf(getFilteredMentions("full n", VARIABLES))).toEqual([
      "full_name",
    ])
  })

  it("matches on the raw variable value typed by hand", () => {
    expect(valuesOf(getFilteredMentions("full_name", VARIABLES))).toEqual([
      "full_name",
    ])
  })

  it("matches label and value case-insensitively", () => {
    expect(valuesOf(getFilteredMentions("EMAIL", VARIABLES))).toEqual(["email"])
  })

  it("returns nothing when neither label nor value matches", () => {
    expect(getFilteredMentions("zzz", VARIABLES)).toEqual([])
  })

  it("matches every variable whose label or value contains the query", () => {
    expect(valuesOf(getFilteredMentions("name", VARIABLES))).toEqual([
      "full_name",
      "first_name",
    ])
  })
})
