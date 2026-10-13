// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ProductMultiSelect } from "../components/product-multi-select"

type SendableInput = {
  workspaceId: string
  channel: string
  keyword?: string
  productIds?: string[]
  perPage?: number
}

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
}))

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

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string
    children?: React.ReactNode
  }) => <a href={href}>{children}</a>,
}))

// Same call shape as the real client: the query function is what the API returns.
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    productsAPI: {
      listSendableProductsAuthorizedAPI: {
        queryOptions: ({ input, ...options }: { input: SendableInput }) => ({
          queryKey: ["listSendable", input],
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
  imageUrl: null,
  price: 10,
  currency: "USD",
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

const render = async (
  props: Partial<React.ComponentProps<typeof ProductMultiSelect>> = {},
) => {
  const onChange = vi.fn()
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <ProductMultiSelect
          channel="whatsapp"
          max={3}
          onChange={onChange}
          value={[]}
          {...props}
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

describe("ProductMultiSelect", () => {
  test("names the products already chosen, even when they are not on the search page", async () => {
    mocks.list.mockImplementation((input: SendableInput) =>
      Promise.resolve(
        input.productIds
          ? { ready: true, data: [product("7", "Red shoes")], pageCount: 1 }
          : { ready: true, data: [], pageCount: 0 },
      ),
    )

    await render({ value: ["7"] })
    await flush()

    expect(container.textContent).toContain("Red shoes")
    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "whatsapp",
        productIds: ["7"],
        workspaceId: "ws-1",
      }),
    )
  })

  test("a chosen product that is no longer sendable is flagged, not hidden", async () => {
    mocks.list.mockResolvedValue({ ready: true, data: [], pageCount: 0 })

    await render({ value: ["9"] })
    await flush()

    expect(container.textContent).toContain("unavailableProduct")
  })

  test("a failed lookup does not accuse a chosen product of being unavailable", async () => {
    mocks.list.mockRejectedValue(new Error("boom"))

    await render({ value: ["7"] })
    await flush()

    expect(container.textContent).not.toContain("unavailableProduct")
    expect(container.textContent).toContain("7")
  })

  test("keeps the names on screen while the next lookup is in flight", async () => {
    mocks.list.mockImplementation((input: SendableInput) =>
      Promise.resolve({
        ready: true,
        data: (input.productIds ?? []).map((id) => product(id, `Name ${id}`)),
        pageCount: 1,
      }),
    )
    await render({ value: ["1"] })
    await flush()
    expect(container.textContent).toContain("Name 1")

    // The step now holds two products: the second lookup resolves later.
    let release: (value: unknown) => void = () => undefined
    mocks.list.mockImplementation(
      (input: SendableInput) =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              ready: true,
              data: (input.productIds ?? []).map((id) =>
                product(id, `Name ${id}`),
              ),
              pageCount: 1,
            })
        }),
    )
    await render({ value: ["1", "2"] })

    expect(container.textContent).toContain("Name 1")
    expect(container.textContent).not.toContain("unavailableProduct")
    release(undefined)
  })

  test("lists options only once opened, and picking one adds it", async () => {
    mocks.list.mockResolvedValue({
      ready: true,
      data: [product("1"), product("2")],
      pageCount: 1,
    })
    const onChange = await render({ value: ["1"] })
    expect(mocks.list).not.toHaveBeenCalledWith(
      expect.objectContaining({ keyword: undefined, productIds: undefined }),
    )

    await openPicker()
    expect(optionTexts()).toHaveLength(2)

    act(() => {
      ;(
        document.body.querySelectorAll('[role="option"]')[1] as HTMLElement
      ).click()
    })

    expect(onChange).toHaveBeenCalledWith(["1", "2"])
  })

  test("pages through a result set longer than one page", async () => {
    mocks.list.mockImplementation(async (input: { page?: number }) => ({
      ready: true,
      data: [product(String(input.page ?? 1))],
      pageCount: 3,
    }))
    await render({ value: [] })
    await openPicker()
    expect(optionTexts()).toHaveLength(1)

    const next = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "next",
    ) as HTMLButtonElement
    act(() => {
      next.click()
    })

    await vi.waitFor(() =>
      expect(mocks.list).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
      ),
    )
  })

  test("picking a chosen product again removes it", async () => {
    mocks.list.mockResolvedValue({
      ready: true,
      data: [product("1"), product("2")],
      pageCount: 1,
    })
    const onChange = await render({ value: ["1", "2"] })

    await openPicker()
    act(() => {
      ;(
        document.body.querySelectorAll('[role="option"]')[0] as HTMLElement
      ).click()
    })

    expect(onChange).toHaveBeenCalledWith(["2"])
  })

  test("products used elsewhere in the message are not offered again", async () => {
    mocks.list.mockResolvedValue({
      ready: true,
      data: [product("1"), product("2"), product("3")],
      pageCount: 1,
    })
    await render({ excludeIds: ["2"] })

    await openPicker()

    expect(optionTexts().join(" ")).not.toContain("Product 2")
    expect(optionTexts()).toHaveLength(2)
  })

  test("once full, only the chosen ones can still be toggled", async () => {
    mocks.list.mockResolvedValue({
      ready: true,
      data: [product("1"), product("2"), product("3")],
      pageCount: 1,
    })
    const onChange = await render({ max: 2, value: ["1", "2"] })

    await openPicker()
    act(() => {
      ;(
        document.body.querySelectorAll('[role="option"]')[2] as HTMLElement
      ).click()
    })

    expect(onChange).not.toHaveBeenCalled()
  })

  test("a single select replaces its value instead of adding", async () => {
    mocks.list.mockResolvedValue({
      ready: true,
      data: [product("1"), product("2")],
      pageCount: 1,
    })
    const onChange = await render({ max: 1, value: ["1"] })

    await openPicker()
    act(() => {
      ;(
        document.body.querySelectorAll('[role="option"]')[1] as HTMLElement
      ).click()
    })

    expect(onChange).toHaveBeenCalledWith(["2"])
  })

  test("removing a chip drops that product", async () => {
    mocks.list.mockResolvedValue({
      ready: true,
      data: [product("1"), product("2")],
      pageCount: 1,
    })
    const onChange = await render({ value: ["1", "2"] })
    await flush()

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="removeProduct"]')
        ?.click()
    })

    expect(onChange).toHaveBeenCalledWith(["2"])
  })

  test("explains when no catalog is connected and links to Products", async () => {
    mocks.list.mockResolvedValue({
      ready: false,
      reason: "catalogNotConnected",
      data: [],
      pageCount: 0,
    })
    await render()

    await openPicker()

    expect(document.body.textContent).toContain("catalogNotConnected")
    expect(document.body.querySelector("a")?.getAttribute("href")).toBe(
      "/space/ws-1/products",
    )
  })

  test("explains when the channel cannot send products", async () => {
    mocks.list.mockResolvedValue({
      ready: false,
      reason: "channelUnsupported",
      data: [],
      pageCount: 0,
    })
    await render()

    await openPicker()

    expect(document.body.textContent).toContain("channelUnsupported")
    expect(document.body.querySelector("a")).toBeNull()
  })

  test("a failed request offers a retry that asks again", async () => {
    mocks.list
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue({ ready: true, data: [product("1")], pageCount: 1 })
    await render()

    await openPicker()
    expect(document.body.textContent).toContain("loadError")

    const callsBefore = mocks.list.mock.calls.length
    act(() => {
      Array.from(document.body.querySelectorAll("button"))
        .find((button) => button.textContent === "retry")
        ?.click()
    })
    await flush()

    expect(mocks.list.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  test("an empty catalog says there is nothing to pick", async () => {
    mocks.list.mockResolvedValue({ ready: true, data: [], pageCount: 0 })
    await render()

    await openPicker()

    expect(document.body.textContent).toContain("noProducts")
  })
})
