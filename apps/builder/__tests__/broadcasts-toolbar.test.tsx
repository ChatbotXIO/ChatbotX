import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { BroadcastsToolbar } from "@/features/broadcasts/components/broadcasts-toolbar"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "ws-1",
}))

const setQuery = vi.fn()
let currentName: string | null = null
vi.mock("nuqs", () => ({
  parseAsInteger: { withDefault: () => ({}) },
  parseAsString: {},
  parseAsStringEnum: () => ({ withDefault: () => ({}) }),
  useQueryStates: () => [
    { name: currentName, page: 1, view: "table" },
    setQuery,
  ],
}))

const inputValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value",
)?.set

let container: HTMLDivElement | null = null
let root: Root | null = null

function renderToolbar(ui: React.ReactElement) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(ui)
  })
  return container
}

function getSearchInput(el: HTMLElement): HTMLInputElement {
  const input = el.querySelector("input")
  if (!input) {
    throw new Error("search input not rendered")
  }
  return input
}

function typeSearch(input: HTMLInputElement, value: string) {
  act(() => {
    inputValueSetter?.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
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
  setQuery.mockReset()
  currentName = null
  vi.useRealTimers()
})

describe("BroadcastsToolbar", () => {
  test("commits the debounced search value once after typing", () => {
    vi.useFakeTimers()
    const el = renderToolbar(
      <BroadcastsToolbar onOpenPanel={vi.fn()} panelOpen />,
    )

    typeSearch(getSearchInput(el), "sale")
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(setQuery).toHaveBeenCalledTimes(1)
    expect(setQuery).toHaveBeenCalledWith({ name: "sale", page: 1 })
  })

  test("resyncs the input when the URL name changes externally", () => {
    const el = renderToolbar(
      <BroadcastsToolbar onOpenPanel={vi.fn()} panelOpen />,
    )
    expect(getSearchInput(el).value).toBe("")

    currentName = "other"
    act(() => {
      root?.render(<BroadcastsToolbar onOpenPanel={vi.fn()} panelOpen />)
    })

    expect(getSearchInput(el).value).toBe("other")
  })

  test("does not reset the input when the external name matches what it just committed", () => {
    vi.useFakeTimers()
    const el = renderToolbar(
      <BroadcastsToolbar onOpenPanel={vi.fn()} panelOpen />,
    )
    const input = getSearchInput(el)

    typeSearch(input, "sale")
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(setQuery).toHaveBeenCalledWith({ name: "sale", page: 1 })

    // The URL now reflects what this toolbar itself just committed. Keep
    // typing past that point and re-render with the matching external
    // value — the resync effect must not clobber the newer keystrokes.
    typeSearch(input, "sale extra")
    currentName = "sale"
    act(() => {
      root?.render(<BroadcastsToolbar onOpenPanel={vi.fn()} panelOpen />)
    })

    expect(input.value).toBe("sale extra")
  })
})
