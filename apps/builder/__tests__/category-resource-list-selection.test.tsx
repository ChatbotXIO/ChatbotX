// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { CategoryResourceList } from "@/features/templates/components/category-resource-list"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

// jsdom has no PointerEvent constructor; Base UI's Checkbox reads pointer
// event fields (`pointerType`) inside its own click handler, so a plain
// MouseEvent throws there. Polyfill with MouseEvent's fields, matching the
// common jsdom + Base UI/Radix test workaround.
class PointerEventPolyfill extends MouseEvent {
  pointerType: string
  constructor(type: string, params: PointerEventInit = {}) {
    super(type, params)
    this.pointerType = params.pointerType ?? "mouse"
  }
}
;(
  window as unknown as { PointerEvent: typeof PointerEventPolyfill }
).PointerEvent ??= PointerEventPolyfill

const listSelectableResourcesAPI = vi.fn()

type PagedInput = (cursor: string | undefined) => unknown

vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    templatesAPI: {
      listSelectableResourcesAPI: {
        infiniteOptions: (options: {
          input: PagedInput
          initialPageParam: undefined
          getNextPageParam: (page: unknown) => unknown
        }) => ({
          ...options,
          queryKey: ["selectable", options.input(undefined)],
          queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
            Promise.resolve(
              listSelectableResourcesAPI(options.input(pageParam)),
            ),
        }),
        queryOptions: ({ input }: { input: unknown }) => ({
          queryKey: ["selectable-all", input],
          queryFn: () => Promise.resolve(listSelectableResourcesAPI(input)),
        }),
      },
    },
  },
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

async function renderComponent(ui: React.ReactElement) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  await act(() => {
    root?.render(
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
    )
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return container
}

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount()
    })
  }
  container?.remove()
  container = null
  root = null
  vi.clearAllMocks()
})

const FULL_SET = ["id-1", "id-2", "id-3"]

const clickCheckbox = async (node: Element) => {
  await act(() => {
    node.dispatchEvent(new window.PointerEvent("click", { bubbles: true }))
  })
}

describe("CategoryResourceList selection", () => {
  test("select-all after a search still selects the full unfiltered set, not just the matches", async () => {
    listSelectableResourcesAPI.mockImplementation(
      (input: { keyword?: string }) => {
        if (input.keyword) {
          // A search only ever returns the matching subset — must never
          // become the new `allIds`.
          return {
            items: [{ id: "id-2", name: "Matching Flow" }],
            nextCursor: null,
            total: 1,
            allIds: undefined,
          }
        }
        return {
          items: FULL_SET.map((id) => ({ id, name: id })),
          nextCursor: null,
          total: FULL_SET.length,
          allIds: FULL_SET,
        }
      },
    )

    const onChange = vi.fn()
    const el = await renderComponent(
      <CategoryResourceList
        category="flows"
        onChange={onChange}
        selection={{ mode: "ids", ids: [] }}
        workspaceId="ws-1"
      />,
    )

    // Initial unfiltered load captured allIds = FULL_SET.
    expect(listSelectableResourcesAPI).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: undefined, cursor: undefined }),
    )

    const searchInput = el.querySelector(
      "input[placeholder]",
    ) as HTMLInputElement

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set
    await act(() => {
      nativeInputValueSetter?.call(searchInput, "Matching")
      searchInput.dispatchEvent(new Event("input", { bubbles: true }))
    })

    // Let the real debounce settle and the search query answer, so the
    // search ran through the component's own hook, not a re-invoked mock.
    await vi.waitFor(async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
      })
      expect(listSelectableResourcesAPI).toHaveBeenCalledWith(
        expect.objectContaining({ keyword: "Matching" }),
      )
    })

    const selectAllCheckbox = el.querySelector(
      '[role="checkbox"][aria-labelledby="flows-select-all-label"]',
    ) as HTMLElement
    await clickCheckbox(selectAllCheckbox)

    // Because `allIds` was captured from the unfiltered fetch and a search
    // must never overwrite it, "select all" resolves to the full set, not
    // just the single search match.
    expect(onChange).toHaveBeenCalledWith({ mode: "ids", ids: FULL_SET })
  })

  test("unchecking a row while mode:all downgrades to the exact allIds set, not just the loaded page", async () => {
    listSelectableResourcesAPI.mockResolvedValue({
      items: FULL_SET.map((id) => ({ id, name: id })),
      nextCursor: null,
      total: FULL_SET.length,
      allIds: FULL_SET,
    })

    const onChange = vi.fn()
    const el = await renderComponent(
      <CategoryResourceList
        category="flows"
        onChange={onChange}
        selection={{ mode: "all" }}
        workspaceId="ws-1"
      />,
    )

    const allCheckboxes = Array.from(el.querySelectorAll('[role="checkbox"]'))
    // Selection checkboxes only: the select-all box and every View only (lock)
    // box are separate controls with their own labels.
    const rowCheckboxes = allCheckboxes.filter(
      (node) =>
        !(
          ["flows-select-all-label", "flows-lock-all-label"].includes(
            node.getAttribute("aria-labelledby") ?? "",
          ) ||
          (node.getAttribute("aria-labelledby") ?? "").endsWith("-lock-label")
        ),
    )
    expect(rowCheckboxes.length).toBe(FULL_SET.length)

    await clickCheckbox(rowCheckboxes[1])

    expect(onChange).toHaveBeenCalledWith({
      mode: "ids",
      ids: FULL_SET.filter((id) => id !== "id-2"),
    })
  })
  // Above the allIds cap the hook pages through every id itself: the API
  // serves at most 200 rows a call, so one "limit: total" request was refused.
  test("unchecking a row in a category too big for allIds fetches every page of ids", async () => {
    const BIG = Array.from({ length: 450 }, (_, index) => `big-${index}`)
    listSelectableResourcesAPI.mockImplementation(
      (input: { cursor?: string; limit: number }) => {
        const start = input.cursor ? Number(input.cursor) : 0
        const end = Math.min(start + input.limit, BIG.length)
        return {
          items: BIG.slice(start, end).map((id) => ({ id, name: id })),
          nextCursor: end < BIG.length ? String(end) : null,
          total: BIG.length,
        }
      },
    )

    const onChange = vi.fn()
    const el = await renderComponent(
      <CategoryResourceList
        category="flows"
        onChange={onChange}
        selection={{ mode: "all" }}
        workspaceId="ws-1"
      />,
    )
    const firstRow = Array.from(el.querySelectorAll('[role="checkbox"]')).find(
      (node) =>
        !(
          ["flows-select-all-label", "flows-lock-all-label"].includes(
            node.getAttribute("aria-labelledby") ?? "",
          ) ||
          (node.getAttribute("aria-labelledby") ?? "").endsWith("-lock-label")
        ),
    )
    await clickCheckbox(firstRow as Element)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const pageCalls = listSelectableResourcesAPI.mock.calls
      .map(([input]) => input as { limit: number })
      .filter((input) => input.limit === 200)
    expect(pageCalls).toHaveLength(3)
    expect(onChange).toHaveBeenCalledWith({
      mode: "ids",
      ids: BIG.filter((id) => id !== "big-0"),
    })
  })
})
