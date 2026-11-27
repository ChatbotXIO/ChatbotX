import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { DateTimePicker } from "../src/components/ui/date-picker"

const noop = () => {
  // jsdom does not implement this API
}

class ResizeObserverStub {
  observe = noop
  unobserve = noop
  disconnect = noop
}

globalThis.ResizeObserver ??=
  ResizeObserverStub as unknown as typeof ResizeObserver
Element.prototype.scrollIntoView ??= noop

describe("DateTimePicker month navigation", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("browsing to another month does not change the value", async () => {
    const onChange = vi.fn()
    await act(() => {
      root.render(
        <DateTimePicker
          granularity="day"
          onChange={onChange}
          value={new Date(2026, 4, 20)}
        />,
      )
    })

    await act(() => {
      container.querySelector("button")?.click()
    })
    const previous = document.querySelector<HTMLButtonElement>(
      'button[aria-label*="previous" i]',
    )
    expect(previous).not.toBeNull()
    await act(() => {
      previous?.click()
    })

    expect(onChange).not.toHaveBeenCalled()
  })

  test("editing the time after browsing months keeps the selected day", async () => {
    const onChange = vi.fn()
    await act(() => {
      root.render(
        <DateTimePicker
          granularity="minute"
          onChange={onChange}
          value={new Date(2026, 4, 20, 10, 30)}
        />,
      )
    })

    await act(() => {
      container.querySelector("button")?.click()
    })
    await act(() => {
      document
        .querySelector<HTMLButtonElement>('button[aria-label*="previous" i]')
        ?.click()
    })
    const hours = document.querySelector<HTMLInputElement>(
      "input#datetime-picker-hour-input",
    )
    expect(hours).not.toBeNull()
    await act(() => {
      hours?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
      )
    })

    const picked = onChange.mock.lastCall?.[0] as Date | undefined
    expect(picked?.getFullYear()).toBe(2026)
    expect(picked?.getMonth()).toBe(4)
    expect(picked?.getDate()).toBe(20)
    expect(picked?.getHours()).toBe(11)
    expect(picked?.getMinutes()).toBe(30)
  })
})
