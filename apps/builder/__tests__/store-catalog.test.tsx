import { act, type ComponentProps } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  useQueryState: vi.fn(),
  withOptions: vi.fn(),
  setQuery: vi.fn(),
  setCategory: vi.fn(),
  setLanguage: vi.fn(),
  params: {} as Record<string, string | null>,
}))

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
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
    section: "primary" as const,
  },
]

let container: HTMLDivElement | null = null
let root: Root | null = null

/** The layouts the component offers, read from its own props so they cannot drift. */
type StoreCatalogLayout = ComponentProps<typeof StoreCatalog>["layout"]

const render = (
  layout?: StoreCatalogLayout,
  items: CatalogTemplate[] = templates,
  viewerLocale = "en",
): HTMLDivElement => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <StoreCatalog
        categories={categories}
        layout={layout}
        templates={items}
        tenantName="Acme Bots"
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
    if (key === "lang") {
      return [mocks.params.lang ?? null, mocks.setLanguage]
    }
    return [mocks.params.category ?? null, mocks.setCategory]
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
    expect(el.querySelector("h2")).toBeNull()
  })

  test("the page layout is the default", () => {
    expect(render().querySelector("h1")).not.toBeNull()
  })

  test("the embedded layout has the same header as /store, as an h2 under the page's own h1", () => {
    const el = render("embedded")

    const wrapper = el.firstElementChild
    expect(wrapper?.className).toContain("flex w-full flex-col gap-8")
    expect(wrapper?.className).not.toContain("max-w-6xl")
    expect(wrapper?.className).not.toContain("pt-4")
    expect(el.querySelector("h1")).toBeNull()
    expect(el.querySelector("h2")?.textContent).toBe("title")
    expect(el.textContent).toContain("subtitle")
    expect(el.querySelector('input[type="search"]')).not.toBeNull()
    expect(
      el.querySelector('a[href="/t/template?id=11&key=tok-11"]'),
    ).not.toBeNull()
  })

  test("the page grid follows the window width, as /store always did", () => {
    const grid = render("page").querySelector("ul")

    expect(grid?.className).toBe("grid gap-4 sm:grid-cols-2 lg:grid-cols-3")
  })

  test("the embedded grid fits as many roomy cards as its own container allows", () => {
    const grid = render("embedded").querySelector("ul")

    expect(grid?.className).toContain(
      "grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))]",
    )
    expect(grid?.className).toContain("gap-5")
    expect(grid?.className).not.toContain("lg:grid-cols-3")
  })
})

describe("StoreCatalog URL state", () => {
  test("search and category update the URL in the browser only, replacing the history entry", () => {
    render()

    expect(mocks.useQueryState).toHaveBeenCalledWith(
      "category",
      expect.anything(),
    )
    expect(mocks.useQueryState).toHaveBeenCalledWith("q", expect.anything())
    expect(mocks.useQueryState).toHaveBeenCalledWith("lang", expect.anything())
    // One options object per parser (category, lang, q), all client-side and replacing.
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
    expect(render().querySelector('[aria-label="language"]')).toBeNull()
    expect(
      render("page", [
        { ...baseTemplate, languages: ["en"] },
        { ...baseTemplate, templateId: "2", languages: [] },
      ]).querySelector('[aria-label="language"]'),
    ).toBeNull()
  })

  test("the filter appears as soon as another language exists, and starts on the visitor's", () => {
    const el = render("page", multiLanguage)
    const trigger = el.querySelector('[aria-label="language"]')
    expect(trigger).not.toBeNull()
    expect(trigger?.textContent).toContain("English")
  })

  test("own language: own and untagged on top, other languages under a divider, Vietnamese left out", () => {
    const el = render("page", multiLanguage)

    expect(names(el)).toEqual(["Mine", "Anywhere", "French only"])
    expect(el.querySelector("hr")).not.toBeNull()
    expect(el.querySelector("section")?.textContent).toContain("otherLanguages")
    expect(el.querySelector("section li")?.textContent).toContain("French only")
  })

  test("all languages: every template in one list, Vietnamese included, no divider", () => {
    mocks.params = { lang: "all" }
    const el = render("page", multiLanguage)

    expect(names(el)).toEqual(["Mine", "Anywhere", "French only", "Vietnamese"])
    expect(el.querySelector("hr")).toBeNull()
    expect(el.querySelector("section")).toBeNull()
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

    expect(el.querySelector('[aria-label="language"]')?.textContent).toContain(
      "Tiếng Việt",
    )
    expect(names(el)).toEqual(["Vn", "Anywhere"])
    expect(el.querySelector("hr")).toBeNull()
  })

  test("no divider when the visitor has no templates of their own", () => {
    const el = render("page", [multiLanguage[2] as CatalogTemplate])

    expect(el.querySelector("hr")).toBeNull()
    expect(names(el)).toEqual(["French only"])
    expect(el.querySelector("section")?.textContent).toContain("otherLanguages")
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

  test("category chips only list categories that have a template in the chosen language", () => {
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
      { ...baseTemplate, templateId: "3", languages: ["en"], categoryIds: [] },
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
          tenantName="Acme Bots"
          viewerLocale="en"
        />,
      )
    })

    expect(container.textContent).toContain("Flows")
    expect(container.textContent).not.toContain("Viet only")
  })

  test("no match offers a button that clears search and category and shows every language", () => {
    mocks.params = { q: "zzz" }
    const el = render("page", multiLanguage)

    expect(el.textContent).toContain("noResults")
    const clear = Array.from(el.querySelectorAll("button")).find(
      (b) => b.textContent === "clearSearch",
    )
    expect(clear).toBeDefined()
    act(() => clear?.click())
    expect(mocks.setQuery).toHaveBeenCalledWith(null)
    expect(mocks.setCategory).toHaveBeenCalledWith(null)
    expect(mocks.setLanguage).toHaveBeenCalledWith("all")
  })
})
