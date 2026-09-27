import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useIntervalRouterRefresh } from "@/hooks/use-interval-router-refresh"

const refresh = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}))

const INTERVAL_MS = 30_000

function Probe({ enabled }: { enabled: boolean }) {
  useIntervalRouterRefresh({ enabled, intervalMs: INTERVAL_MS })
  return null
}

let container: HTMLDivElement | null = null
let root: Root | null = null

function render(enabled: boolean) {
  if (!root) {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  }
  act(() => {
    root?.render(<Probe enabled={enabled} />)
  })
}

function unmount() {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  container = null
  root = null
}

beforeEach(() => {
  vi.useFakeTimers()
  refresh.mockReset()
})

afterEach(() => {
  if (root) {
    unmount()
  }
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("useIntervalRouterRefresh", () => {
  test("refreshes the route on every interval while enabled", () => {
    render(true)
    act(() => {
      vi.advanceTimersByTime(INTERVAL_MS * 2)
    })
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  test("does nothing while disabled and stops once disabled again", () => {
    render(false)
    act(() => {
      vi.advanceTimersByTime(INTERVAL_MS * 2)
    })
    expect(refresh).not.toHaveBeenCalled()

    render(true)
    act(() => {
      vi.advanceTimersByTime(INTERVAL_MS)
    })
    expect(refresh).toHaveBeenCalledTimes(1)

    render(false)
    act(() => {
      vi.advanceTimersByTime(INTERVAL_MS * 2)
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  test("skips ticks while the tab is hidden", () => {
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden")
    render(true)
    act(() => {
      vi.advanceTimersByTime(INTERVAL_MS)
    })
    expect(refresh).not.toHaveBeenCalled()

    visibility.mockReturnValue("visible")
    act(() => {
      vi.advanceTimersByTime(INTERVAL_MS)
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  test("clears the interval on unmount", () => {
    render(true)
    unmount()
    act(() => {
      vi.advanceTimersByTime(INTERVAL_MS * 3)
    })
    expect(refresh).not.toHaveBeenCalled()
  })
})
