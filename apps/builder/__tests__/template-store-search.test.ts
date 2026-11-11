import { describe, expect, test } from "vitest"
import {
  filterStoreTemplates,
  type StoreCatalogTemplate,
  shouldShowCategoryFilter,
} from "../src/features/template-store/lib/filter-store-templates"
import { normalizeSearchText } from "../src/features/template-store/lib/normalize-search-text"

const template = (
  overrides: Partial<StoreCatalogTemplate>,
): StoreCatalogTemplate => ({
  templateId: "1",
  name: "Template",
  publisherName: null,
  description: null,
  imageUrl: "/i.png",
  href: "/t/template?id=1&key=k",
  categoryIds: ["10"],
  ...overrides,
})

describe("normalizeSearchText", () => {
  test.each([
    ["Điện thoại", "dien thoai"],
    ["ĐẶT HÀNG", "dat hang"],
    ["Café Crème", "cafe creme"],
    ["  Mixed CASE ", "  mixed case "],
    ["", ""],
  ])("%j -> %j", (input, expected) => {
    expect(normalizeSearchText(input)).toBe(expected)
  })
})

describe("filterStoreTemplates", () => {
  const templates = [
    template({
      templateId: "1",
      name: "Điện thoại bán hàng",
      categoryIds: ["10"],
    }),
    template({
      templateId: "2",
      name: "Support bot",
      publisherName: "Acme Ltd",
      categoryIds: ["10", "20"],
    }),
    template({ templateId: "3", name: "Booking", categoryIds: ["20"] }),
  ]
  const ids = (query: string, categoryId?: string) =>
    filterStoreTemplates({ templates, categoryId, query }).map(
      (t) => t.templateId,
    )

  test("an empty or blank search keeps every template of the category, in order", () => {
    expect(ids("", "10")).toEqual(["1", "2"])
    expect(ids("   ", "20")).toEqual(["2", "3"])
  })

  test("matches without accents or case, and đ as d", () => {
    expect(ids("dien thoai", "10")).toEqual(["1"])
    expect(ids("DIEN", "10")).toEqual(["1"])
  })

  test("matches the publisher name too", () => {
    expect(ids("acme", "20")).toEqual(["2"])
  })

  test("search stays inside the selected category", () => {
    expect(ids("booking", "10")).toEqual([])
    expect(ids("booking", "20")).toEqual(["3"])
  })

  test("a template in two categories shows in both tabs", () => {
    expect(ids("support", "10")).toEqual(["2"])
    expect(ids("support", "20")).toEqual(["2"])
  })

  test("regex-looking input is matched literally", () => {
    expect(ids(".*", "10")).toEqual([])
    expect(ids("(", "10")).toEqual([])
  })
})

describe("shouldShowCategoryFilter", () => {
  const inCategory = (id: string, categoryIds: string[]) =>
    template({ templateId: id, categoryIds })
  const show = (
    categories: string[],
    templates: StoreCatalogTemplate[],
  ): boolean =>
    shouldShowCategoryFilter({
      categories: categories.map((id) => ({ id })),
      templates,
    })

  test("hides the chips when there is no category", () => {
    expect(show([], [inCategory("1", [])])).toBe(false)
  })

  test("hides them for one category that holds every template", () => {
    expect(
      show(["10"], [inCategory("1", ["10"]), inCategory("2", ["10"])]),
    ).toBe(false)
  })

  test("keeps them for one category when some templates have none", () => {
    expect(show(["10"], [inCategory("1", ["10"]), inCategory("2", [])])).toBe(
      true,
    )
  })

  test("keeps them for two or more categories", () => {
    expect(show(["10", "20"], [inCategory("1", ["10", "20"])])).toBe(true)
  })
})
