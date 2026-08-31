import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { BroadcastStatusPanel } from "@/features/broadcasts/components/broadcast-status-panel"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const setQuery = vi.fn()
let currentStatus: string | null = null
vi.mock("nuqs", () => ({
  parseAsInteger: { withDefault: () => ({}) },
  parseAsString: {},
  parseAsStringEnum: () => ({ withDefault: () => ({}) }),
  useQueryStates: () => [{ status: currentStatus, page: 1 }, setQuery],
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

function renderPanel(ui: React.ReactElement) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
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
  setQuery.mockReset()
  currentStatus = null
})

describe("BroadcastStatusPanel", () => {
  test("renders All plus the five design filters in order", () => {
    const el = renderPanel(<BroadcastStatusPanel onOpenChange={vi.fn()} open />)
    const labels = Array.from(el.querySelectorAll("nav button")).map((b) =>
      b.textContent?.trim(),
    )
    expect(labels).toEqual([
      "broadcasts.filters.all",
      "broadcasts.status.draft",
      "broadcasts.status.scheduled",
      "broadcasts.status.sending",
      "broadcasts.status.sent",
      "broadcasts.status.failed",
    ])
  })

  test("marks the active filter and resets the page on click", () => {
    currentStatus = "failed"
    const el = renderPanel(<BroadcastStatusPanel onOpenChange={vi.fn()} open />)
    expect(
      el.querySelector('nav button[aria-pressed="true"]')?.textContent?.trim(),
    ).toBe("broadcasts.status.failed")

    const draft = Array.from(el.querySelectorAll("nav button")).find(
      (b) => b.textContent?.trim() === "broadcasts.status.draft",
    ) as HTMLButtonElement
    act(() => {
      draft.click()
    })
    expect(setQuery).toHaveBeenCalledWith({ status: "draft", page: 1 })
  })

  test("renders nothing when closed", () => {
    const el = renderPanel(
      <BroadcastStatusPanel onOpenChange={vi.fn()} open={false} />,
    )
    expect(el.querySelector("aside")).toBeNull()
  })

  test("does not re-query when the active filter is clicked", () => {
    currentStatus = "failed"
    const el = renderPanel(<BroadcastStatusPanel onOpenChange={vi.fn()} open />)

    const active = el.querySelector(
      'nav button[aria-pressed="true"]',
    ) as HTMLButtonElement
    act(() => {
      active.click()
    })
    expect(setQuery).not.toHaveBeenCalled()
  })
})
