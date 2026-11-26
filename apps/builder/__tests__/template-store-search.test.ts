import { orderedTemplateChannels } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  coversEveryTemplateChannel,
  filterStoreTemplates,
  groupStoreTemplatesByCategory,
  listStoreChannelOptions,
  listStoreLanguageOptions,
  resolveStoreChannel,
  resolveStoreLanguageView,
  STORE_ALL_LANGUAGES,
  type StoreCatalogTemplate,
  type StoreLanguageView,
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
  channels: [],
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

describe("filterStoreTemplates search", () => {
  const templates = [
    template({ templateId: "1", name: "Điện thoại bán hàng" }),
    template({
      templateId: "2",
      name: "Support bot",
      publisherName: "Acme Ltd",
    }),
    template({ templateId: "3", name: "Booking" }),
  ]
  const ids = (query: string) =>
    filterStoreTemplates({
      templates,
      channel: undefined,
      languageView: OWN,
      query,
    }).map((t) => t.templateId)

  test("an empty or blank search keeps every template, in order", () => {
    expect(ids("")).toEqual(["1", "2", "3"])
    expect(ids("   ")).toEqual(["1", "2", "3"])
  })

  test("matches without accents or case, and đ as d", () => {
    expect(ids("dien thoai")).toEqual(["1"])
    expect(ids("DIEN")).toEqual(["1"])
  })

  test("matches the publisher name too", () => {
    expect(ids("acme")).toEqual(["2"])
  })

  test("regex-looking input is matched literally", () => {
    expect(ids(".*")).toEqual([])
    expect(ids("(")).toEqual([])
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
      channel: undefined,
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
        channel: undefined,
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

describe("store channels", () => {
  const catalog = [
    template({
      templateId: "1",
      name: "Shop bot",
      categoryIds: ["10"],
      channels: ["whatsapp"],
    }),
    template({
      templateId: "2",
      name: "Support bot",
      categoryIds: ["20"],
      channels: ["whatsapp", "telegram"],
    }),
    template({
      templateId: "3",
      name: "French bot",
      categoryIds: ["10"],
      channels: ["telegram"],
      languages: ["fr"],
    }),
    template({ templateId: "4", name: "Untagged", categoryIds: ["10"] }),
  ]
  const ids = (input: {
    channel?: Parameters<typeof filterStoreTemplates>[0]["channel"]
    query?: string
    languageView?: StoreLanguageView
  }) =>
    filterStoreTemplates({
      templates: catalog,
      channel: input.channel,
      languageView: input.languageView ?? { mode: "all", value: "all" },
      query: input.query ?? "",
    }).map((t) => t.templateId)

  test("no channel keeps every template, untagged included", () => {
    expect(ids({})).toEqual(["1", "2", "3", "4"])
  })

  test("a channel keeps the templates that carry it and the untagged ones, which work on every channel", () => {
    expect(ids({ channel: "whatsapp" })).toEqual(["1", "2", "4"])
    expect(ids({ channel: "telegram" })).toEqual(["2", "3", "4"])
    expect(ids({ channel: "line" })).toEqual(["4"])
  })

  test("channel, language and search narrow together", () => {
    expect(
      ids({
        channel: "telegram",
        languageView: { mode: "single", value: "fr" },
      }),
      // "2" carries no language and "4" no channel, so they show here too.
    ).toEqual(["2", "3", "4"])
    expect(ids({ channel: "whatsapp", query: "support" })).toEqual(["2"])
    expect(ids({ channel: "whatsapp", query: "french" })).toEqual([])
  })

  test("the channel filter keeps working with the language zones", () => {
    const view: StoreLanguageView = { mode: "own", value: "en" }
    const shown = filterStoreTemplates({
      templates: [
        template({ templateId: "1", channels: ["line"], section: "primary" }),
        template({ templateId: "2", channels: ["line"], section: "other" }),
        template({ templateId: "3", channels: [], section: "primary" }),
      ],
      channel: "line",
      languageView: view,
      query: "",
    })
    const { primary, other } = splitStoreSections(shown, view)
    expect(primary.map((t) => t.templateId)).toEqual(["1", "3"])
    expect(other.map((t) => t.templateId)).toEqual(["2"])
  })

  test("the tabs list only channels a template names (untagged ones add none), in the fixed order", () => {
    expect(listStoreChannelOptions(catalog)).toEqual(["whatsapp", "telegram"])
    expect(
      listStoreChannelOptions([
        template({ channels: ["webchat", "line", "messenger"] }),
      ]),
    ).toEqual(["messenger", "line", "webchat"])
    expect(listStoreChannelOptions([template({})])).toEqual([])
  })

  test("a missing, stale or uncarried channel in the URL means all channels", () => {
    const options = ["whatsapp", "telegram"] as const
    expect(resolveStoreChannel({ param: null, options })).toBeUndefined()
    expect(resolveStoreChannel({ param: "line", options })).toBeUndefined()
    expect(resolveStoreChannel({ param: "telegram", options })).toBe("telegram")
  })
})

describe("groupStoreTemplatesByCategory", () => {
  const categories = [
    { id: "10", name: "Flows" },
    { id: "20", name: "Sales" },
    { id: "30", name: "Empty" },
    { id: "40", name: "Support" },
  ]
  const grouped = groupStoreTemplatesByCategory(
    [
      template({ templateId: "1", categoryIds: ["20"] }),
      template({ templateId: "2", categoryIds: ["10", "20"] }),
      template({ templateId: "3", categoryIds: [] }),
      template({ templateId: "4", categoryIds: ["99"] }),
      template({ templateId: "5", categoryIds: ["40"] }),
    ],
    categories,
    "en",
  )

  test("the fullest category comes first, equal counts go alphabetically, empty ones are left out", () => {
    // Sales holds 2; Flows and Support hold 1 each (Flows sorts first); Empty has none.
    expect(grouped.map((section) => section.key)).toEqual([
      "20",
      "10",
      "40",
      "uncategorized",
    ])
  })

  test("equal counts ignore the store's own category order", () => {
    const reversed = groupStoreTemplatesByCategory(
      [
        template({ templateId: "1", categoryIds: ["20"] }),
        template({ templateId: "2", categoryIds: ["10"] }),
      ],
      [...categories].reverse(),
      "en",
    )
    expect(reversed.map((section) => section.key)).toEqual(["10", "20"])
  })

  test("names sort with the locale's rules: accents and case do not break the order, digits sort numerically", () => {
    const named = [
      { id: "1", name: "Đặt lịch" },
      { id: "2", name: "Ăn uống" },
      { id: "3", name: "Bán hàng" },
      { id: "4", name: "bất động sản" },
      { id: "5", name: "Tour 10" },
      { id: "6", name: "Tour 2" },
    ]
    const sections = groupStoreTemplatesByCategory(
      named.map((category) =>
        template({ templateId: category.id, categoryIds: [category.id] }),
      ),
      named,
      "vi",
    )
    expect(sections.map((section) => section.category?.name)).toEqual([
      "Ăn uống",
      "Bán hàng",
      "bất động sản",
      "Đặt lịch",
      "Tour 2",
      "Tour 10",
    ])
  })

  test("a template in several categories is in each, order kept", () => {
    expect(grouped[0]?.templates.map((t) => t.templateId)).toEqual(["1", "2"])
    expect(grouped[1]?.templates.map((t) => t.templateId)).toEqual(["2"])
  })

  test("templates in none of the listed categories go last, however many, never ranked", () => {
    const many = groupStoreTemplatesByCategory(
      [
        template({ templateId: "a", categoryIds: [] }),
        template({ templateId: "b", categoryIds: [] }),
        template({ templateId: "c", categoryIds: [] }),
        template({ templateId: "d", categoryIds: ["10"] }),
      ],
      categories,
      "en",
    )
    expect(many.map((section) => section.key)).toEqual(["10", "uncategorized"])
    expect(many.at(-1)?.category).toBeNull()
    expect(many.at(-1)?.templates.map((t) => t.templateId)).toEqual([
      "a",
      "b",
      "c",
    ])
  })

  test("no templates gives no sections", () => {
    expect(groupStoreTemplatesByCategory([], categories, "en")).toEqual([])
  })
})

describe("coversEveryTemplateChannel", () => {
  test("a template naming no channel works on every channel", () => {
    expect(coversEveryTemplateChannel([])).toBe(true)
  })

  test("a template naming every channel does too", () => {
    expect(coversEveryTemplateChannel([...orderedTemplateChannels])).toBe(true)
  })

  test("naming all but one does not", () => {
    expect(coversEveryTemplateChannel(orderedTemplateChannels.slice(1))).toBe(
      false,
    )
    expect(
      coversEveryTemplateChannel(orderedTemplateChannels.slice(0, -1)),
    ).toBe(false)
  })

  test("a few channels do not", () => {
    expect(coversEveryTemplateChannel(["whatsapp", "telegram"])).toBe(false)
  })
})
