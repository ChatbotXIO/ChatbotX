import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { coexistRowTrailing } from "@/features/channel-connect/components/coexist-controls"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

Object.assign(globalThis, {
  ResizeObserver: class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  },
})
if (typeof globalThis.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    constructor(type: string, params: MouseEventInit = {}) {
      super(type, params)
    }
  }
  Object.assign(globalThis, { PointerEvent: PointerEventPolyfill })
}

/**
 * The one implementation of a picker row's trailing column: nothing at all on
 * a row that cannot be selected, and the AI switch only while that row is
 * syncing. Both the react-hook-form pickers (`useCoexistSelection`) and
 * `InstagramAccounts` (no form) go through it, so this pins the rule once.
 */
describe("coexistRowTrailing", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  const switches = () =>
    Array.from(container.querySelectorAll<HTMLElement>('[role="switch"]'))

  const render = (
    overrides: Partial<Parameters<typeof coexistRowTrailing>[0]> = {},
  ) => {
    const onSyncChange = vi.fn()
    const onAiReadsSyncedHistoryChange = vi.fn()
    act(() => {
      root.render(
        <div data-testid="trailing-host">
          {coexistRowTrailing({
            aiReadsSyncedHistory: false,
            onAiReadsSyncedHistoryChange,
            onSyncChange,
            row: { name: "Page A" },
            syncing: false,
            ...overrides,
          })}
        </div>,
      )
    })
    return { onSyncChange, onAiReadsSyncedHistoryChange }
  }

  test("a row that cannot be selected renders nothing at all", () => {
    render({ row: { name: "Page A", disabled: true } })

    expect(switches()).toHaveLength(0)
    expect(container.textContent).toBe("")
  })

  test("a selectable row renders only the sync switch until it is syncing", () => {
    render()

    expect(switches()).toHaveLength(1)
    expect(switches()[0]?.getAttribute("aria-label")).toBe(
      "channels.connectMany.stepCoexist — Page A",
    )
  })

  test("the sync switch is inert while the row is not selected", () => {
    render({ syncDisabled: true })

    expect(switches()[0]?.getAttribute("aria-disabled")).toBe("true")
  })

  test("a syncing row reveals the AI switch, named after the same row", () => {
    render({ syncing: true, aiReadsSyncedHistory: true })

    expect(switches()).toHaveLength(2)
    expect(switches()[1]?.getAttribute("aria-label")).toBe(
      "coexist.aiReadsSyncedHistoryLabel — Page A",
    )
    expect(switches()[1]?.getAttribute("aria-checked")).toBe("true")
    // The helper copy rides along as a tooltip rather than a second line.
    expect(switches()[1]?.closest("label")?.getAttribute("title")).toBe(
      "coexist.aiReadsSyncedHistoryHelper",
    )
  })

  test("each switch reports to its own handler", () => {
    const { onSyncChange, onAiReadsSyncedHistoryChange } = render({
      syncing: true,
    })

    act(() => {
      switches()[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    // Base UI passes its own event details as a second argument.
    expect(onAiReadsSyncedHistoryChange).toHaveBeenCalledTimes(1)
    expect(onAiReadsSyncedHistoryChange.mock.calls[0]?.[0]).toBe(true)
    expect(onSyncChange).not.toHaveBeenCalled()

    act(() => {
      switches()[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(onSyncChange).toHaveBeenCalledTimes(1)
    expect(onSyncChange.mock.calls[0]?.[0]).toBe(false)
  })
})
