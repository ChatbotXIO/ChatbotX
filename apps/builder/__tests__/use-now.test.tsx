import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useNow } from "@/hooks/use-now"

const renders: number[] = []

const Clock = ({ intervalMs }: { intervalMs?: number }) => {
  const now = useNow(intervalMs)
  renders.push(now)
  return <time data-testid="now">{now}</time>
}

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  })
  document.dispatchEvent(new Event("visibilitychange"))
}

describe("useNow", () => {
  let container: HTMLDivElement
  let root: Root

  const shown = () =>
    Number(container.querySelector("[data-testid='now']")?.textContent)

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-08T10:00:00Z"))
    renders.length = 0
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    setVisibility("visible")
    vi.useRealTimers()
  })

  test("returns the current time and advances once per interval", () => {
    act(() => {
      root.render(<Clock />)
    })
    const first = shown()
    expect(first).toBe(Date.now())

    act(() => {
      vi.advanceTimersByTime(59_000)
    })
    expect(shown()).toBe(first)

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(shown()).toBe(first + 60_000)
  })

  test("shares one timer between subscribers and re-renders each on the tick", () => {
    act(() => {
      root.render(
        <>
          <Clock />
          <Clock />
          <Clock />
        </>,
      )
    })
    expect(vi.getTimerCount()).toBe(1)
    renders.length = 0

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(renders).toHaveLength(3)
    expect(new Set(renders).size).toBe(1)
  })

  test("stops the timer once the last subscriber unmounts", () => {
    act(() => {
      root.render(<Clock />)
    })
    expect(vi.getTimerCount()).toBe(1)

    act(() => {
      root.unmount()
    })
    root = createRoot(container)

    expect(vi.getTimerCount()).toBe(0)
  })

  test("skips ticks while the tab is hidden and catches up when it is shown", () => {
    act(() => {
      root.render(<Clock />)
    })
    const first = shown()

    act(() => {
      setVisibility("hidden")
      vi.advanceTimersByTime(180_000)
    })
    expect(shown()).toBe(first)

    act(() => {
      setVisibility("visible")
    })
    expect(shown()).toBe(first + 180_000)
  })

  test("does not hand a remount the stale time from a previous subscription", () => {
    act(() => {
      root.render(<Clock />)
    })
    const first = shown()
    act(() => {
      root.unmount()
    })
    root = createRoot(container)
    vi.advanceTimersByTime(600_000)

    act(() => {
      root.render(<Clock />)
    })

    expect(shown()).toBe(first + 600_000)
  })

  test("keeps catching up on visibility after another interval's last subscriber leaves", () => {
    const Both = ({ showCustom }: { showCustom: boolean }) => (
      <>
        <Clock />
        {showCustom && <Clock intervalMs={1000} />}
      </>
    )
    act(() => {
      root.render(<Both showCustom={true} />)
    })
    act(() => {
      root.render(<Both showCustom={false} />)
    })
    const first = shown()

    act(() => {
      setVisibility("hidden")
      vi.advanceTimersByTime(180_000)
      setVisibility("visible")
    })

    expect(shown()).toBe(first + 180_000)
  })

  // `useSyncExternalStore` resubscribes when handed a new subscribe function,
  // and a resubscribe that empties then refills the listener set would reset
  // `now` on every render. With the clock advancing between renders that was
  // an endless render loop; the store callbacks must be stable per interval.
  test("does not re-render in a loop when the clock advances between parent renders", () => {
    let renderCount = 0
    const Counting = () => {
      renderCount += 1
      vi.setSystemTime(Date.now() + 2)
      return <Clock />
    }
    const Parent = ({ tick }: { tick: number }) => (
      <Counting data-tick={tick} key="stable" />
    )

    act(() => {
      root.render(<Parent tick={0} />)
    })
    const first = shown()
    act(() => {
      root.render(<Parent tick={1} />)
    })

    expect(renderCount).toBeLessThanOrEqual(4)
    expect(shown()).toBe(first)
  })

  test("honours a custom interval", () => {
    act(() => {
      root.render(<Clock intervalMs={1000} />)
    })
    const first = shown()

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(shown()).toBe(first + 1000)
  })
})
