import { orderedTemplateChannels } from "@chatbotx.io/database/partials"
import { act, type ComponentProps } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  useQueryState: vi.fn(),
  withOptions: vi.fn(),
  setQuery: vi.fn(),
  setLanguage: vi.fn(),
  setChannel: vi.fn(),
  params: {} as Record<string, string | null>,
}))

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}: ${Object.values(values).join(", ")}` : key,
}))
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string
    children: React.ReactNode
    className?: string
  }) => (
    <a className={className} href={href}>
      {children}
    </a>
  ),
}))
// `withDefault` and `withOptions` are chained by the component; the fake
// parser records the options so the test can assert the URL-update mode.
vi.mock("nuqs", () => {
  const parser = {
    withDefault: () => parser,
    withOptions: (options: unknown) => {
      mocks.withOptions(options)
      return parser
    },
  }
  return {
    parseAsString: parser,
    parseAsStringLiteral: () => parser,
    useQueryState: mocks.useQueryState,
  }
})

import { StoreCatalog } from "@/features/template-store/components/store-catalog"

const categories = [{ id: "5", name: "Flows" }]
type CatalogTemplate = ComponentProps<typeof StoreCatalog>["templates"][number]

const baseTemplate: CatalogTemplate = {
  templateId: "11",
  name: "Welcome flow",
  publisherName: "Acme",
  description: null,
  imageUrl: "/cover.png",
  href: "/t/template?id=11&key=tok-11",
  categoryIds: ["5"],
  languages: [],
  channels: [],
  section: "primary",
}
const templates = [
  {
    templateId: "11",
    name: "Welcome flow",
    publisherName: "Acme",
    description: null,
    imageUrl: "/cover.png",
    href: "/t/template?id=11&key=tok-11",
    categoryIds: ["5"],
    languages: [],
    channels: [],
    section: "primary" as const,
  },
]

const CHARACTER_PHYSICAL_SIDE_CLASS = /(?:^|\s)(?:left|right|ml|mr|pl|pr)-/
const PADDING_CLASS_PREFIXES = ["p-", "py-", "pt-", "pb-"]

let container: HTMLDivElement | null = null
let root: Root | null = null

/** The layouts the component offers, read from its own props so they cannot drift. */
type StoreCatalogLayout = ComponentProps<typeof StoreCatalog>["layout"]

const render = (
  layout?: StoreCatalogLayout,
  items: CatalogTemplate[] = templates,
  viewerLocale = "en",
  storeCategories: ComponentProps<
    typeof StoreCatalog
  >["categories"] = categories,
): HTMLDivElement => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <StoreCatalog
        categories={storeCategories}
        layout={layout}
        templates={items}
        viewerLocale={viewerLocale}
      />,
    )
  })
  return container
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.params = {}
  mocks.useQueryState.mockImplementation((key: string) => {
    if (key === "q") {
      return [mocks.params.q ?? "", mocks.setQuery]
    }
    if (key === "channel") {
      return [mocks.params.channel ?? null, mocks.setChannel]
    }
    if (key === "lang") {
      return [mocks.params.lang ?? null, mocks.setLanguage]
    }
    return [null, vi.fn()]
  })
})

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount()
    })
  }
  container?.remove()
  container = null
  root = null
})

describe("StoreCatalog layouts", () => {
  test("the page layout keeps the public /store wrapper and its h1", () => {
    const el = render("page")

    const wrapper = el.firstElementChild
    expect(wrapper?.className.split(" ")).toEqual(
      expect.arrayContaining([
        "flex",
        "w-full",
        "flex-col",
        "gap-8",
        "mx-auto",
        "max-w-6xl",
        "pt-4",
        "sm:pt-10",
      ]),
    )
    expect(el.querySelector("h1")?.textContent).toBe("title")
    // A category title sits one level under the page's h1.
    expect(el.querySelector("h2")?.textContent).toBe("Flows")
  })

  test("the page layout is the default", () => {
    expect(render().querySelector("h1")).not.toBeNull()
  })

  test("the embedded layout has no title of its own: the search row comes first and the sections are the h2s under the home page's h1", () => {
    const el = render("embedded")

    const wrapper = el.firstElementChild
    expect(wrapper?.className).toContain("flex w-full flex-col gap-8")
    expect(wrapper?.className).not.toContain("max-w-6xl")
    expect(wrapper?.className).not.toContain("pt-4")
    expect(el.querySelector("h1")).toBeNull()
    expect(el.textContent).not.toContain("home.tabs.templates")
    expect(el.textContent).not.toContain("title")
    const header = wrapper?.firstElementChild
    expect(
      header?.firstElementChild?.querySelector('input[type="search"]'),
    ).not.toBeNull()
    expect(
      Array.from(el.querySelectorAll("h2")).map((h) => h.textContent),
    ).toEqual(["Flows"])
    expect(el.querySelector("h3")).toBeNull()
    expect(
      el.querySelector('a[href="/t/template?id=11&key=tok-11"]'),
    ).not.toBeNull()
  })

  test("the page grid follows the window width, as /store always did", () => {
    const grid = render("page").querySelector("ul")

    expect(grid?.className).toBe(
      "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
    )
  })

  test("the embedded grid fits as many roomy cards as its own container allows", () => {
    const grid = render("embedded").querySelector("ul")

    expect(grid?.className).toContain(
      "grid-cols-[repeat(auto-fill,minmax(min(100%,21rem),1fr))]",
    )
    expect(grid?.className).toContain("gap-5")
    expect(grid?.className).not.toContain("lg:grid-cols-3")
  })
})

describe("StoreCatalog cards", () => {
  test("a card has a tinted header with the name and the cover as a small illustration, then the description, and no publisher line", () => {
    const el = render("embedded", [
      { ...baseTemplate, description: "A welcome flow." },
    ])

    const card = el.querySelector("li a")
    expect(card?.className.split(" ")).toEqual(
      expect.arrayContaining(["rounded-xl", "border", "p-2"]),
    )
    expect(card?.className).not.toContain("shadow")
    const header = card?.firstElementChild
    expect(header?.className.split(" ")).toEqual(
      expect.arrayContaining(["min-h-28", "rounded-lg", "overflow-hidden"]),
    )
    const cover = header?.querySelector("img")
    expect(cover?.getAttribute("src")).toBe("/cover.png")
    expect(cover?.className.split(" ")).toEqual(
      expect.arrayContaining([
        "size-20",
        "self-center",
        "rounded-lg",
        "object-cover",
      ]),
    )
    expect(header?.querySelector("p.font-semibold")?.textContent).toBe(
      "Welcome flow",
    )
    expect(card?.lastElementChild?.textContent).toBe("A welcome flow.")
    expect(card?.textContent).not.toContain("Acme")
  })

  test("every card header uses the same subtle muted background, whatever its channels", () => {
    const el = render("page", [
      { ...baseTemplate, templateId: "1", name: "Few", channels: ["whatsapp"] },
      { ...baseTemplate, templateId: "2", name: "None", channels: [] },
      {
        ...baseTemplate,
        templateId: "3",
        name: "Many",
        channels: ["whatsapp", "telegram", "line"],
      },
    ])

    for (const card of Array.from(el.querySelectorAll("li a"))) {
      expect(card.firstElementChild?.className.split(" ")).toContain(
        "bg-muted/60",
      )
    }
  })

  test("line-clamped card text has no vertical padding, so the next line never shows under the ellipsis", () => {
    const el = render("page", [
      { ...baseTemplate, description: "A long description." },
    ])

    const clamped = Array.from(
      el.querySelectorAll("li a [class*='line-clamp']"),
    )
    expect(clamped.length).toBe(2)
    for (const node of clamped) {
      const classes = node.className.split(" ")
      expect(
        classes.filter((c) =>
          PADDING_CLASS_PREFIXES.some((prefix) => c.startsWith(prefix)),
        ),
      ).toEqual([])
    }
  })

  test("user-entered text is isolated in <bdi>, while the blocks follow the page direction", () => {
    const el = render(
      "page",
      [{ ...baseTemplate, description: "A welcome flow." }],
      "en",
      [{ id: "5", name: "Flows" }],
    )

    const card = el.querySelector("li a")
    const name = card?.querySelector("p.font-semibold")
    const description = card?.querySelector("p.line-clamp-3")
    const heading = el.querySelector("section h2")
    expect(name?.querySelector("bdi")?.textContent).toBe("Welcome flow")
    expect(description?.querySelector("bdi")?.textContent).toBe(
      "A welcome flow.",
    )
    expect(heading?.querySelector("bdi")?.textContent).toBe("Flows")
    // No dir on the blocks: they align with the page (start = right in Arabic).
    for (const block of [name, description, heading]) {
      expect(block?.hasAttribute("dir")).toBe(false)
    }
    expect(el.querySelector('[dir="auto"]')).toBeNull()
  })

  test("the channel icons sit on top of the header's text column", () => {
    const el = render("page", [
      { ...baseTemplate, templateId: "1", channels: ["whatsapp"] },
      { ...baseTemplate, templateId: "2", name: "Plain", channels: [] },
    ])

    const [tagged] = Array.from(el.querySelectorAll("li a"))
    const column = tagged?.firstElementChild?.firstElementChild
    expect(column?.firstElementChild?.tagName).toBe("UL")
  })

  test("a template with channels shows one named icon per channel", () => {
    const el = render("page", [
      { ...baseTemplate, templateId: "1", channels: ["whatsapp", "telegram"] },
      { ...baseTemplate, templateId: "2", name: "Plain", channels: [] },
    ])

    const [tagged, plain] = Array.from(el.querySelectorAll("li a"))
    expect(
      Array.from(tagged?.querySelectorAll('[role="img"]') ?? []).map((icon) =>
        icon.getAttribute("aria-label"),
      ),
    ).toEqual(["fields.whatsapp.label", "fields.telegram.label"])
    // The channel-less card has its own globe (next test), never brand icons.
    expect(plain?.querySelectorAll('[role="img"]').length).toBe(0)
  })

  test("a card without channels shows the globe and a visible All channels label, name still at the bottom", () => {
    const el = render("page", [
      { ...baseTemplate, templateId: "1", channels: [] },
    ])

    const column =
      el.querySelector("li a")?.firstElementChild?.firstElementChild
    expect(column?.querySelectorAll('[role="img"]').length).toBe(0)
    expect(column?.firstElementChild?.textContent).toBe(
      "templateStore.store.allChannels",
    )
    const globe = column?.querySelector('span[aria-hidden="true"] svg')
    expect(globe?.getAttribute("class")).toContain("text-muted-foreground")
    expect(column?.querySelector("p.font-semibold")?.className).toContain(
      "mt-auto",
    )
  })

  test("a card naming every channel shows the same globe and label as one naming none", () => {
    const el = render("page", [
      {
        ...baseTemplate,
        templateId: "1",
        channels: [...orderedTemplateChannels],
      },
    ])

    expect(el.querySelectorAll('li a [role="img"]').length).toBe(0)
    expect(el.querySelector("li a")?.textContent).toContain(
      "templateStore.store.allChannels",
    )
  })

  test("a card with channels shows their brand icons and no globe", () => {
    const el = render("page", [
      { ...baseTemplate, templateId: "1", channels: ["whatsapp"] },
    ])

    const labels = Array.from(el.querySelectorAll('li a [role="img"]')).map(
      (icon) => icon.getAttribute("aria-label"),
    )
    expect(labels).toEqual(["fields.whatsapp.label"])
  })
})

describe("StoreCatalog URL state", () => {
  test("search, channel and language update the URL in the browser only, replacing the history entry, and the old category param is ignored", () => {
    render()

    expect(mocks.useQueryState).not.toHaveBeenCalledWith(
      "category",
      expect.anything(),
    )
    expect(mocks.useQueryState).toHaveBeenCalledWith("q", expect.anything())
    expect(mocks.useQueryState).toHaveBeenCalledWith("lang", expect.anything())
    expect(mocks.useQueryState).toHaveBeenCalledWith(
      "channel",
      expect.anything(),
    )
    // One options object per parser (channel, lang, q), all client-side and replacing.
    expect(mocks.withOptions).toHaveBeenCalledTimes(3)
    for (const [options] of mocks.withOptions.mock.calls) {
      expect(options).toEqual({
        shallow: true,
        scroll: false,
        history: "replace",
        clearOnDefault: true,
      })
    }
  })
})

const multiLanguage: CatalogTemplate[] = [
  { ...baseTemplate, templateId: "1", name: "Mine", languages: ["en"] },
  { ...baseTemplate, templateId: "2", name: "Anywhere", languages: [] },
  {
    ...baseTemplate,
    templateId: "3",
    name: "French only",
    languages: ["fr"],
    section: "other",
  },
  {
    ...baseTemplate,
    templateId: "4",
    name: "Vietnamese",
    languages: ["vi"],
    section: "hidden",
  },
]

const names = (el: HTMLElement): string[] =>
  Array.from(el.querySelectorAll("li p.font-semibold")).map(
    (p) => p.textContent ?? "",
  )

describe("StoreCatalog languages", () => {
  test("no language filter when every template is untagged or in the visitor's language", () => {
    expect(render().querySelector('[aria-label^="language"]')).toBeNull()
    expect(
      render("page", [
        { ...baseTemplate, languages: ["en"] },
        { ...baseTemplate, templateId: "2", languages: [] },
      ]).querySelector('[aria-label^="language"]'),
    ).toBeNull()
  })

  test("the filter appears as soon as another language exists, and starts on the visitor's", () => {
    const el = render("page", multiLanguage)
    const trigger = el.querySelector('[aria-label^="language"]')
    expect(trigger).not.toBeNull()
    // The full label of the selected value, the same as in the list.
    expect(trigger?.textContent).toBe("English")
    expect(trigger?.getAttribute("aria-label")).toBe("languageValue: English")
    expect(trigger?.className.split(" ")).toEqual(
      expect.arrayContaining(["w-auto", "min-w-36", "shrink-0"]),
    )
    expect(trigger?.querySelector("[title]")?.getAttribute("title")).toBe(
      "English",
    )
  })

  test("the header is the title, then the search and the language trigger on one row, then the channel tabs", () => {
    const el = render("page", [
      { ...multiLanguage[0], channels: ["whatsapp"] } as CatalogTemplate,
      ...multiLanguage.slice(1),
    ])

    const header = el.firstElementChild?.firstElementChild
    const [title, controls] = Array.from(header?.children ?? [])
    expect(title?.tagName).toBe("H1")
    const [search, language] = Array.from(controls?.children ?? [])
    expect(search?.querySelector('input[type="search"]')).not.toBeNull()
    expect(search?.className).toContain("flex-1")
    expect(language?.getAttribute("aria-label")).toBe("languageValue: English")
    expect(language?.className.split(" ")).toEqual(
      expect.arrayContaining(["h-10", "rounded-lg", "shrink-0"]),
    )
    expect(header?.lastElementChild?.tagName).toBe("FIELDSET")
    // Logical properties only: nothing is pinned to the left or right.
    expect(header?.innerHTML).not.toMatch(CHARACTER_PHYSICAL_SIDE_CLASS)
  })

  test("own language: own and untagged on top, other languages under a divider, Vietnamese left out", () => {
    const el = render("page", multiLanguage)

    expect(names(el)).toEqual(["Mine", "Anywhere", "French only"])
    expect(el.querySelector("hr")).not.toBeNull()
    expect(
      el.querySelector('section[aria-label="otherLanguages"]')?.textContent,
    ).toContain("otherLanguages")
    expect(
      el.querySelector('section[aria-label="otherLanguages"] li')?.textContent,
    ).toContain("French only")
  })

  test("all languages: every template in one list, Vietnamese included, no divider", () => {
    mocks.params = { lang: "all" }
    const el = render("page", multiLanguage)

    expect(names(el)).toEqual(["Mine", "Anywhere", "French only", "Vietnamese"])
    expect(el.querySelector("hr")).toBeNull()
    expect(el.querySelector('section[aria-label="otherLanguages"]')).toBeNull()
  })

  test("another language: its templates and the untagged ones, no divider", () => {
    mocks.params = { lang: "vi" }
    const el = render("page", multiLanguage)

    expect(names(el)).toEqual(["Vietnamese", "Anywhere"])
    expect(el.querySelector("hr")).toBeNull()
  })

  test("a Vietnamese visitor starts on Vietnamese and sees one zone only", () => {
    const vietnamese: CatalogTemplate[] = [
      { ...baseTemplate, templateId: "1", name: "Vn", languages: ["vi"] },
      { ...baseTemplate, templateId: "2", name: "Anywhere", languages: [] },
      {
        ...baseTemplate,
        templateId: "3",
        name: "English",
        languages: ["en"],
        section: "hidden",
      },
    ]
    const el = render("page", vietnamese, "vi")

    const trigger = el.querySelector('[aria-label^="language"]')
    expect(trigger?.textContent).toBe("Tiếng Việt")
    expect(trigger?.getAttribute("aria-label")).toBe(
      "languageValue: Tiếng Việt",
    )
    expect(names(el)).toEqual(["Vn", "Anywhere"])
    expect(el.querySelector("hr")).toBeNull()
  })

  test("no divider when the visitor has no templates of their own", () => {
    const el = render("page", [multiLanguage[2] as CatalogTemplate])

    expect(el.querySelector("hr")).toBeNull()
    expect(names(el)).toEqual(["French only"])
    expect(
      el.querySelector('section[aria-label="otherLanguages"]')?.textContent,
    ).toContain("otherLanguages")
  })

  test("the visitor's own templates come before the untagged ones on top", () => {
    const el = render("page", [
      { ...baseTemplate, templateId: "1", name: "Anywhere", languages: [] },
      { ...baseTemplate, templateId: "2", name: "Mine", languages: ["en"] },
    ])

    expect(names(el)).toEqual(["Mine", "Anywhere"])
  })

  test("an unknown language in the URL falls back to the visitor's language", () => {
    mocks.params = { lang: "ja" }

    expect(names(render("page", multiLanguage))).toEqual([
      "Mine",
      "Anywhere",
      "French only",
    ])
  })

  test("a category with nothing in the chosen language has no section", () => {
    const withCategories: CatalogTemplate[] = [
      {
        ...baseTemplate,
        templateId: "1",
        languages: ["en"],
        categoryIds: ["5"],
      },
      {
        ...baseTemplate,
        templateId: "2",
        languages: ["vi"],
        section: "hidden",
        categoryIds: ["6"],
      },
    ]
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root?.render(
        <StoreCatalog
          categories={[
            { id: "5", name: "Flows" },
            { id: "6", name: "Viet only" },
          ]}
          templates={withCategories}
          viewerLocale="en"
        />,
      )
    })

    expect(container.textContent).toContain("Flows")
    expect(container.textContent).not.toContain("Viet only")
  })

  test("no match offers a button that clears search and channel and shows every language", () => {
    mocks.params = { q: "zzz" }
    const el = render("page", multiLanguage)

    expect(el.textContent).toContain("noResults")
    const clear = Array.from(el.querySelectorAll("button")).find(
      (b) => b.textContent === "clearSearch",
    )
    expect(clear).toBeDefined()
    act(() => clear?.click())
    expect(mocks.setQuery).toHaveBeenCalledWith(null)
    expect(mocks.setChannel).toHaveBeenCalledWith(null)
    expect(mocks.setLanguage).toHaveBeenCalledWith("all")
  })
})

const channelCatalog: CatalogTemplate[] = [
  { ...baseTemplate, templateId: "1", name: "Wa", channels: ["whatsapp"] },
  {
    ...baseTemplate,
    templateId: "2",
    name: "Both",
    channels: ["whatsapp", "telegram"],
  },
  { ...baseTemplate, templateId: "3", name: "Untagged", channels: [] },
]

const tabLabels = (el: HTMLElement): string[] =>
  Array.from(el.querySelectorAll("fieldset button")).map(
    // The brand icon contributes its own name; the label is what follows it.
    (button) => button.lastChild?.textContent ?? "",
  )

describe("StoreCatalog channels", () => {
  test("tabs list All channels then only the channels a template carries", () => {
    const el = render("page", channelCatalog)

    expect(tabLabels(el)).toEqual([
      "templateStore.store.allChannels",
      "fields.whatsapp.label",
      "fields.telegram.label",
    ])
  })

  test("tabs wrap onto further rows instead of scrolling sideways", () => {
    const fieldset = render("page", channelCatalog).querySelector("fieldset")
    const channelGroup = fieldset?.querySelector("div > div")

    expect(fieldset?.className).not.toContain("overflow-x-auto")
    expect(channelGroup?.className).toContain("flex-wrap")
    expect(channelGroup?.className).not.toContain("grid-flow-col")
    // Below `sm` the channels drop under "All channels" at full width.
    expect(channelGroup?.className).toContain("basis-full")
    expect(channelGroup?.className).toContain("sm:basis-0")
    expect(fieldset?.querySelector("div")?.className).toContain(
      "sm:flex-nowrap",
    )
    // "All channels" sits outside the wrapping group, so rows wrap under WhatsApp.
    expect(channelGroup?.querySelectorAll("button")).toHaveLength(2)
    expect(fieldset?.querySelectorAll("button")).toHaveLength(3)
    const [allChannels, ...channelTabs] = Array.from(
      fieldset?.querySelectorAll("button") ?? [],
    )
    expect(allChannels?.className).toContain("justify-center")
    for (const tab of channelTabs) {
      expect(tab.className).toContain("justify-start")
      expect(tab.className).not.toContain("justify-center")
    }
    for (const tab of Array.from(fieldset?.querySelectorAll("button") ?? [])) {
      expect(tab.className).toContain("min-w-32")
    }
  })

  test("no tabs when no template has a channel", () => {
    const el = render("page", [baseTemplate])

    expect(el.querySelector("fieldset")).toBeNull()
    expect(el.querySelector("button[aria-pressed]")).toBeNull()
  })

  test("a channel keeps the templates that carry it and the untagged ones, which work on every channel", () => {
    mocks.params = { channel: "telegram" }
    expect(names(render("page", channelCatalog))).toEqual(["Both", "Untagged"])
  })

  test("with no channel chosen every template shows, untagged included", () => {
    expect(names(render("page", channelCatalog))).toEqual([
      "Wa",
      "Both",
      "Untagged",
    ])
  })

  test("a channel no template carries reads as all channels", () => {
    mocks.params = { channel: "line" }
    expect(names(render("page", channelCatalog))).toHaveLength(3)
  })

  test("the chosen tab is pressed, and clicking a tab sets the channel in the URL", () => {
    mocks.params = { channel: "whatsapp" }
    const el = render("page", channelCatalog)

    const [all, whatsapp, telegram] = Array.from(
      el.querySelectorAll("fieldset button"),
    )
    expect(whatsapp?.getAttribute("aria-pressed")).toBe("true")
    expect(all?.getAttribute("aria-pressed")).toBe("false")
    act(() =>
      telegram?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    )
    expect(mocks.setChannel).toHaveBeenCalledWith("telegram")
    act(() => all?.dispatchEvent(new MouseEvent("click", { bubbles: true })))
    expect(mocks.setChannel).toHaveBeenCalledWith(null)
  })

  test("sections follow the chosen channel: empty ones disappear and the rest re-rank by count", () => {
    const catalog: CatalogTemplate[] = [
      {
        ...baseTemplate,
        templateId: "1",
        name: "Wa1",
        channels: ["whatsapp"],
        categoryIds: ["5"],
      },
      {
        ...baseTemplate,
        templateId: "2",
        name: "Wa2",
        channels: ["whatsapp"],
        categoryIds: ["5"],
      },
      {
        ...baseTemplate,
        templateId: "3",
        name: "Tg1",
        channels: ["telegram"],
        categoryIds: ["6"],
      },
      {
        ...baseTemplate,
        templateId: "4",
        name: "Tg2",
        channels: ["telegram"],
        categoryIds: ["6", "7"],
      },
      {
        ...baseTemplate,
        templateId: "5",
        name: "Tg3",
        channels: ["telegram"],
        categoryIds: ["6"],
      },
    ]
    const cats = [
      { id: "5", name: "Flows" },
      { id: "6", name: "Sales" },
      { id: "7", name: "Support" },
    ]
    const titles = (el: HTMLElement) =>
      Array.from(el.querySelectorAll("section h2")).map((h) => h.textContent)

    expect(titles(render("page", catalog, "en", cats))).toEqual([
      "Sales",
      "Flows",
      "Support",
    ])

    act(() => root?.unmount())
    container?.remove()
    mocks.params = { channel: "telegram" }
    expect(titles(render("page", catalog, "en", cats))).toEqual([
      "Sales",
      "Support",
    ])

    act(() => root?.unmount())
    container?.remove()
    mocks.params = { channel: "whatsapp" }
    expect(titles(render("page", catalog, "en", cats))).toEqual(["Flows"])
  })

  test("a channel carried only by a template the language view hides has no tab until all languages", () => {
    const hidden: CatalogTemplate[] = [
      {
        ...baseTemplate,
        templateId: "1",
        name: "Mine",
        channels: ["whatsapp"],
      },
      {
        ...baseTemplate,
        templateId: "2",
        name: "Vietnamese zalo",
        languages: ["vi"],
        section: "hidden",
        channels: ["zalo"],
      },
    ]

    expect(tabLabels(render("page", hidden))).toEqual([
      "templateStore.store.allChannels",
      "fields.whatsapp.label",
    ])

    act(() => root?.unmount())
    container?.remove()
    mocks.params = { lang: "all" }
    expect(tabLabels(render("page", hidden))).toEqual([
      "templateStore.store.allChannels",
      "fields.whatsapp.label",
      "fields.zalo.label",
    ])
  })

  test("a selected channel the language view hides reads as all channels", () => {
    mocks.params = { channel: "zalo" }
    const el = render("page", [
      {
        ...baseTemplate,
        templateId: "1",
        name: "Mine",
        channels: ["whatsapp"],
      },
      {
        ...baseTemplate,
        templateId: "2",
        name: "Vietnamese zalo",
        languages: ["vi"],
        section: "hidden",
        channels: ["zalo"],
      },
    ])

    expect(names(el)).toEqual(["Mine"])
  })

  test("a tab's accessible name is the channel label alone, not the brand icon's title as well", () => {
    const el = render("page", channelCatalog)

    const whatsapp = Array.from(el.querySelectorAll("fieldset button")).find(
      (button) => button.textContent?.includes("fields.whatsapp.label"),
    )
    expect(whatsapp?.querySelector('[aria-hidden="true"] svg')).not.toBeNull()
    const visibleText = Array.from(whatsapp?.childNodes ?? [])
      .filter(
        (node) =>
          node.nodeType === Node.TEXT_NODE ||
          (node as Element).getAttribute("aria-hidden") !== "true",
      )
      .map((node) => node.textContent)
      .join("")
    expect(visibleText).toBe("fields.whatsapp.label")
  })
})

describe("StoreCatalog sections", () => {
  const sectionCategories = [
    { id: "5", name: "Flows" },
    { id: "6", name: "Sales" },
    { id: "7", name: "Empty" },
  ]
  const sectioned: CatalogTemplate[] = [
    { ...baseTemplate, templateId: "1", name: "A", categoryIds: ["6"] },
    { ...baseTemplate, templateId: "2", name: "B", categoryIds: ["5", "6"] },
    { ...baseTemplate, templateId: "3", name: "C", categoryIds: [] },
  ]
  const headings = (el: HTMLElement): string[] =>
    Array.from(el.querySelectorAll("section h2")).map(
      (heading) => heading.textContent ?? "",
    )

  test("there are no category chips; each category is a section, the fullest first, a template in two shows in both, and the rest go last", () => {
    const el = render("page", sectioned, "en", sectionCategories)

    // Only the channel tabs remain as a fieldset; there are no category chips.
    expect(el.querySelectorAll("fieldset").length).toBeLessThanOrEqual(1)
    expect(el.textContent).not.toContain("categories")
    expect(headings(el)).toEqual(["Sales", "Flows", "uncategorized"])
    const sections = Array.from(el.querySelectorAll("section"))
    const namesIn = (section: Element | undefined) =>
      Array.from(section?.querySelectorAll("li p.font-semibold") ?? []).map(
        (name) => name.textContent,
      )
    expect(namesIn(sections[0])).toEqual(["A", "B"])
    expect(namesIn(sections[1])).toEqual(["B"])
    expect(namesIn(sections[2])).toEqual(["C"])
  })

  test("the Other languages zone is grouped by category too, one heading level lower", () => {
    const zoned: CatalogTemplate[] = [
      { ...baseTemplate, templateId: "1", name: "Mine", categoryIds: ["5"] },
      {
        ...baseTemplate,
        templateId: "2",
        name: "French one",
        languages: ["fr"],
        section: "other",
        categoryIds: ["6"],
      },
      {
        ...baseTemplate,
        templateId: "3",
        name: "French two",
        languages: ["fr"],
        section: "other",
        categoryIds: ["6"],
      },
      {
        ...baseTemplate,
        templateId: "4",
        name: "French loose",
        languages: ["fr"],
        section: "other",
        categoryIds: [],
      },
    ]
    const el = render("page", zoned, "en", sectionCategories)

    const zone = el.querySelector('section[aria-label="otherLanguages"]')
    expect(zone?.querySelector("h2")?.textContent).toBe("otherLanguages")
    expect(
      Array.from(zone?.querySelectorAll("h3") ?? []).map((h) => h.textContent),
    ).toEqual(["Sales", "uncategorized"])
    expect(
      Array.from(
        zone
          ?.querySelectorAll("section")[0]
          ?.querySelectorAll("li p.font-semibold") ?? [],
      ).map((n) => n.textContent),
    ).toEqual(["French one", "French two"])
    // The main zone keeps its own sections, and ids stay unique across zones.
    expect(headings(el).slice(0, 1)).toEqual(["Flows"])
    const ids = Array.from(el.querySelectorAll("[id]")).map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)

    act(() => root?.unmount())
    container?.remove()
    const embedded = render("embedded", zoned, "en", sectionCategories)
    expect(
      Array.from(
        embedded
          .querySelector('section[aria-label="otherLanguages"]')
          ?.querySelectorAll("h3") ?? [],
      ).map((h) => h.textContent),
    ).toEqual(["Sales", "uncategorized"])
  })

  test("an old ?category= in the URL is ignored", () => {
    mocks.params = { category: "6" }
    const el = render("page", sectioned, "en", sectionCategories)

    expect(headings(el)).toEqual(["Sales", "Flows", "uncategorized"])
  })

  test("a store with no categories shows one plain grid", () => {
    const el = render("page", [baseTemplate], "en", [])

    expect(el.querySelector("section h2")).toBeNull()
    expect(names(el)).toEqual(["Welcome flow"])
  })

  test("a store with categories keeps the uncategorized heading when only uncategorized templates remain", () => {
    const loose: CatalogTemplate[] = [
      { ...baseTemplate, templateId: "3", name: "C", categoryIds: [] },
    ]
    const el = render("page", loose, "en", sectionCategories)

    expect(headings(el)).toEqual(["uncategorized"])
    expect(names(el)).toEqual(["C"])
  })

  test("the Other languages zone keeps the uncategorized heading when it holds only uncategorized templates", () => {
    const zoned: CatalogTemplate[] = [
      { ...baseTemplate, templateId: "1", name: "Mine", categoryIds: ["5"] },
      {
        ...baseTemplate,
        templateId: "2",
        name: "French loose",
        languages: ["fr"],
        section: "other",
        categoryIds: [],
      },
    ]
    const el = render("page", zoned, "en", sectionCategories)

    const zone = el.querySelector('section[aria-label="otherLanguages"]')
    expect(
      Array.from(zone?.querySelectorAll("h3") ?? []).map((h) => h.textContent),
    ).toEqual(["uncategorized"])
  })

  test("the embedded layout has no store title, so the sections are the h2s directly under the page's h1", () => {
    const el = render("embedded", sectioned, "en", sectionCategories)

    expect(
      Array.from(el.querySelectorAll("h2")).map((h) => h.textContent),
    ).toEqual(["Sales", "Flows", "uncategorized"])
  })

  test("the page layout keeps its h1 title above the sections", () => {
    const el = render("page", sectioned, "en", sectionCategories)

    expect(el.querySelector("h1")?.textContent).toBe("title")
    expect(
      Array.from(el.querySelectorAll("h2")).map((h) => h.textContent),
    ).toEqual(["Sales", "Flows", "uncategorized"])
  })
})
