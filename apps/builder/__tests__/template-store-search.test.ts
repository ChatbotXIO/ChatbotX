import { describe, expect, test } from "vitest"
import {
  filterStoreTemplates,
  listStoreLanguageOptions,
  resolveStoreLanguageView,
  STORE_ALL_LANGUAGES,
  type StoreCatalogTemplate,
  type StoreLanguageView,
  shouldShowCategoryFilter,
  splitStoreSections,
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
  languages: [],
  section: "primary",
  ...overrides,
})

const OWN: StoreLanguageView = { mode: "own", value: "en" }

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
    filterStoreTemplates({
      templates,
      categoryId,
      languageView: OWN,
      query,
    }).map((t) => t.templateId)

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

describe("language filter", () => {
  const templates = [
    template({ templateId: "1", languages: ["en"], section: "primary" }),
    template({ templateId: "2", languages: ["fr"], section: "other" }),
    template({ templateId: "3", languages: [], section: "primary" }),
    template({ templateId: "4", languages: ["vi"], section: "hidden" }),
  ]
  const ids = (languageView: StoreLanguageView) =>
    filterStoreTemplates({
      templates,
      categoryId: undefined,
      languageView,
      query: "",
    }).map((t) => t.templateId)

  test("the visitor's own language leaves out the hidden templates", () => {
    expect(ids(OWN)).toEqual(["1", "2", "3"])
  })

  test("all languages shows every template, Vietnamese included", () => {
    expect(ids({ mode: "all", value: STORE_ALL_LANGUAGES })).toEqual([
      "1",
      "2",
      "3",
      "4",
    ])
  })

  test("another language keeps its templates and the untagged ones", () => {
    expect(ids({ mode: "single", value: "vi" })).toEqual(["3", "4"])
    expect(ids({ mode: "single", value: "ja" })).toEqual(["3"])
  })

  test("only the visitor's own language has a lower zone", () => {
    const own = splitStoreSections(templates.slice(0, 3), OWN)
    expect(own.primary.map((t) => t.templateId)).toEqual(["1", "3"])
    expect(own.other.map((t) => t.templateId)).toEqual(["2"])
    const all = splitStoreSections(templates, {
      mode: "all",
      value: STORE_ALL_LANGUAGES,
    })
    expect(all.primary).toHaveLength(4)
    expect(all.other).toEqual([])
  })

  test("own language and a picked language put their tagged templates before the untagged ones, each group newest first", () => {
    // Server order (newest first): untagged, en, untagged, en+vi.
    const mixed = [
      template({ templateId: "a", languages: [] }),
      template({ templateId: "b", languages: ["en"] }),
      template({ templateId: "c", languages: [] }),
      template({ templateId: "d", languages: ["en", "vi"] }),
      template({ templateId: "e", languages: ["fr"], section: "other" }),
    ]
    // As the store does: the view's filter first, then the zones.
    const ids = (view: StoreLanguageView) => {
      const shown = filterStoreTemplates({
        templates: mixed,
        categoryId: undefined,
        languageView: view,
        query: "",
      })
      const { primary, other } = splitStoreSections(shown, view)
      return {
        primary: primary.map((t) => t.templateId),
        other: other.map((t) => t.templateId),
      }
    }

    expect(ids(OWN)).toEqual({ primary: ["b", "d", "a", "c"], other: ["e"] })
    // A template tagged with several languages counts as tagged.
    expect(ids({ mode: "single", value: "vi" })).toEqual({
      primary: ["d", "a", "c"],
      other: [],
    })
    expect(ids({ mode: "single", value: "fr" })).toEqual({
      primary: ["e", "a", "c"],
      other: [],
    })
    // All languages keeps the store's order.
    expect(ids({ mode: "all", value: STORE_ALL_LANGUAGES })).toEqual({
      primary: ["a", "b", "c", "d", "e"],
      other: [],
    })
  })

  test("options are the visitor's language first, then every other one, once", () => {
    expect(listStoreLanguageOptions(templates, "en")).toEqual([
      "en",
      "fr",
      "vi",
    ])
    expect(listStoreLanguageOptions([template({})], "vi")).toEqual(["vi"])
  })

  test("the URL value resolves to a view; missing or stale means the visitor's language", () => {
    const resolve = (param: string | null) =>
      resolveStoreLanguageView({
        param,
        options: ["en", "fr", "vi"],
        viewerLocale: "en",
      })
    expect(resolve(null)).toEqual({ mode: "own", value: "en" })
    expect(resolve("en")).toEqual({ mode: "own", value: "en" })
    expect(resolve("ja")).toEqual({ mode: "own", value: "en" })
    expect(resolve("fr")).toEqual({ mode: "single", value: "fr" })
    expect(resolve(STORE_ALL_LANGUAGES)).toEqual({
      mode: "all",
      value: STORE_ALL_LANGUAGES,
    })
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
