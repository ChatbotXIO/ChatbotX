import { act, type ComponentProps } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  useQueryState: vi.fn(),
  withOptions: vi.fn(),
  setQuery: vi.fn(),
  setCategory: vi.fn(),
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
const templates = [
  {
    templateId: "11",
    name: "Welcome flow",
    publisherName: "Acme",
    description: null,
    imageUrl: "/cover.png",
    href: "/t/template?id=11&key=tok-11",
    categoryIds: ["5"],
  },
]

let container: HTMLDivElement | null = null
let root: Root | null = null

/** The layouts the component offers, read from its own props so they cannot drift. */
type StoreCatalogLayout = ComponentProps<typeof StoreCatalog>["layout"]

const render = (layout?: StoreCatalogLayout): HTMLDivElement => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <StoreCatalog
        categories={categories}
        layout={layout}
        templates={templates}
        tenantName="Acme Bots"
      />,
    )
  })
  return container
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.useQueryState.mockImplementation((key: string) =>
    key === "q"
      ? ["", mocks.setQuery]
      : [null as string | null, mocks.setCategory],
  )
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
    // One options object per parser (category, q), both client-side and replacing.
    expect(mocks.withOptions).toHaveBeenCalledTimes(2)
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
