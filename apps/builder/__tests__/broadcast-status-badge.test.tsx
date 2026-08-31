import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { BroadcastStatusBadge } from "@/features/broadcasts/components/broadcast-status-badge"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

function renderComponent(ui: React.ReactElement) {
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
})

describe("BroadcastStatusBadge", () => {
  test("renders the translated label and status dot for a known status", () => {
    const el = renderComponent(<BroadcastStatusBadge status="failed" />)

    expect(el.textContent).toBe("broadcasts.status.failed")
    const dot = el.querySelector("[aria-hidden]")
    expect(dot).not.toBeNull()
    expect(dot?.className).toContain("bg-red-500")
  })

  test("renders the raw value with no dot for an unrecognized status", () => {
    const el = renderComponent(<BroadcastStatusBadge status="nope" />)

    expect(el.textContent).toBe("nope")
    expect(el.querySelector("[aria-hidden]")).toBeNull()
  })
})
