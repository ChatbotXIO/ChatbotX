// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ProductCombobox } from "../product-combobox"

type ListInput = {
  workspaceId: string
  name?: string
  ids?: string[]
  page?: number
  perPage?: number
}

const mocks = vi.hoisted(() => ({ list: vi.fn() }))

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "ws-1" }))

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // biome-ignore lint/performance/noImgElement: test double for next/image
    <img alt={alt} height={1} src={src} width={1} />
  ),
}))

// Same call shape as the real client: the query function is what the API returns.
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    productsAPI: {
      listProductsAuthorizedAPI: {
        queryOptions: ({ input, ...options }: { input: ListInput }) => ({
          queryKey: ["listProducts", input],
          queryFn: () => mocks.list(input),
          ...options,
        }),
      },
    },
  },
}))

const product = (id: string, name = `Product ${id}`) => ({
  id,
  name,
  images: [{ url: `https://img/${id}.png`, type: "link" }],
  price: 10,
  currency: "USD",
})
const page = (...products: ReturnType<typeof product>[]) => ({
  data: products,
  pageCount: 1,
})

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  mocks.list.mockReset()
  // cmdk scrolls the active item into view; jsdom has no layout.
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ""
})

const render = async (value: string | null = null) => {
  const onChange = vi.fn()
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <ProductCombobox
          onChange={onChange}
          placeholder="Any product"
          value={value}
        />
      </QueryClientProvider>,
    )
    await Promise.resolve()
  })
  return onChange
}

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

const openPicker = async () => {
  act(() => {
    container.querySelector<HTMLButtonElement>("button")?.click()
  })
  await flush()
}

const optionTexts = () =>
  Array.from(document.body.querySelectorAll('[role="option"]')).map(
    (element) => element.textContent ?? "",
  )

describe("ProductCombobox", () => {
  test("shows the placeholder, and no clear button, while nothing is chosen", async () => {
    await render(null)

    expect(container.textContent).toContain("Any product")
    expect(container.querySelector('button[aria-label="clear"]')).toBeNull()
    // Closed, nothing has been fetched yet.
    expect(mocks.list).not.toHaveBeenCalled()
  })

  test("names the chosen product by looking up exactly its id", async () => {
    mocks.list.mockResolvedValue(page(product("7", "Red shoes")))

    await render("7")
    await flush()

    expect(container.textContent).toContain("Red shoes")
    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", ids: ["7"] }),
    )
  })

  test("a chosen product that cannot be found keeps its id on screen", async () => {
    mocks.list.mockResolvedValue(page())

    await render("9")
    await flush()

    expect(container.textContent).toContain("9")
    expect(container.textContent).not.toContain("Any product")
  })

  test("a failed name lookup also falls back to the id", async () => {
    mocks.list.mockRejectedValue(new Error("boom"))

    await render("9")
    await flush()

    expect(container.textContent).toContain("9")
  })

  test("lists the workspace's products when opened and chooses one", async () => {
    mocks.list.mockResolvedValue(page(product("1"), product("2")))
    const onChange = await render(null)

    await openPicker()

    expect(optionTexts()).toHaveLength(2)
    expect(optionTexts()[0]).toContain("Product 1")
    expect(optionTexts()[0]).toContain("$10.00")
    act(() => {
      ;(
        document.body.querySelectorAll('[role="option"]')[1] as HTMLElement
      ).click()
    })
    expect(onChange).toHaveBeenCalledWith("2")
  })

  test("choosing the product that is already chosen clears it", async () => {
    mocks.list.mockResolvedValue(page(product("1")))
    const onChange = await render("1")
    await flush()

    await openPicker()
    act(() => {
      ;(document.body.querySelector('[role="option"]') as HTMLElement).click()
    })

    expect(onChange).toHaveBeenCalledWith(null)
  })

  test("the clear button empties the choice", async () => {
    mocks.list.mockResolvedValue(page(product("1")))
    const onChange = await render("1")
    await flush()

    act(() => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="clear"]')
        ?.click()
    })

    expect(onChange).toHaveBeenCalledWith(null)
  })

  test("says so when there are no products", async () => {
    mocks.list.mockResolvedValue(page())
    await render(null)

    await openPicker()

    expect(document.body.textContent).toContain("noRecordFound")
  })

  test("shows an error with a retry when the list cannot be loaded, then recovers", async () => {
    mocks.list.mockRejectedValueOnce(new Error("boom"))
    await render(null)

    await openPicker()
    expect(document.body.textContent).toContain("errorLoadingData")

    mocks.list.mockResolvedValue(page(product("1")))
    const retry = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "retry",
    )
    act(() => retry?.click())
    await flush()

    expect(optionTexts()).toHaveLength(1)
  })
})
