// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { MetaCatalogProductSelect } from "../meta-catalog-product-select"

type SearchInput = {
  workspaceId: string
  keyword?: string
  retailerId?: string
}

const mocks = vi.hoisted(() => ({ search: vi.fn() }))

vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    whatsappMessageTemplateAPIs: {
      searchMetaCatalogProductsAPI: {
        queryOptions: (options: { input: SearchInput }) => ({
          ...options,
          queryKey: ["meta-catalog-products", options.input],
          queryFn: () => mocks.search(options.input),
        }),
      },
    },
  },
}))

vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "ws-1" }))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const SHIRT = { retailerId: "SKU-2", name: "Shirt", imageUrl: null }

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  mocks.search.mockReset()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = async (value?: string) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MetaCatalogProductSelect onChange={() => undefined} value={value} />
      </QueryClientProvider>,
    )
    await Promise.resolve()
  })
  // The query client notifies subscribers on a timer, not a microtask.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}

describe("MetaCatalogProductSelect — a saved pick", () => {
  test("is shown by its name, without opening the list", async () => {
    mocks.search.mockResolvedValue({ connected: true, items: [SHIRT] })

    await render("SKU-2")

    expect(container.textContent).toContain("Shirt")
    expect(container.textContent).not.toContain(
      "catalogSelectedProductFallback",
    )
    expect(mocks.search).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      retailerId: "SKU-2",
    })
  })

  test("falls back to the id when the catalog no longer has it", async () => {
    mocks.search.mockResolvedValue({ connected: true, items: [] })

    await render("gone")

    expect(container.textContent).toContain("catalogSelectedProductFallback")
  })

  test("looks nothing up when nothing is picked", async () => {
    await render(undefined)

    expect(mocks.search).not.toHaveBeenCalled()
    expect(container.textContent).toContain("actions.pleaseSelect")
  })
})
