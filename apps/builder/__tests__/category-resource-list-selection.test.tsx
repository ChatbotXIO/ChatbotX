// @vitest-environment jsdom

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

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    templatesAPI: {
      listSelectableResourcesAPI: (
        ...args: Parameters<typeof listSelectableResourcesAPI>
      ) => listSelectableResourcesAPI(...args),
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
  await act(() => {
    root?.render(ui)
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
  vi.useRealTimers()
})

const FULL_SET = ["id-1", "id-2", "id-3"]

const clickCheckbox = async (node: Element) => {
  await act(() => {
    node.dispatchEvent(new window.PointerEvent("click", { bubbles: true }))
  })
}

describe("CategoryResourceList selection", () => {
  test("select-all after a search still selects the full unfiltered set, not just the matches", async () => {
    vi.useFakeTimers()
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

    // Drive the real debounce timer so `fetchPage(null, "Matching")` runs
    // through the component's own effect, not a re-invoked mock.
    await act(() => {
      vi.advanceTimersByTime(500)
    })
    await act(async () => {
      await Promise.resolve()
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
    const rowCheckboxes = allCheckboxes.filter(
      (node) =>
        node.getAttribute("aria-labelledby") !== "flows-select-all-label",
    )
    expect(rowCheckboxes.length).toBe(FULL_SET.length)

    await clickCheckbox(rowCheckboxes[1])

    expect(onChange).toHaveBeenCalledWith({
      mode: "ids",
      ids: FULL_SET.filter((id) => id !== "id-2"),
    })
  })
})
