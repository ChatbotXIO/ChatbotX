// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { InstallProgressRefresher } from "@/features/templates/components/install-progress-refresher"

const refresh = vi.fn()
const invalidateLocks = vi.fn(() => Promise.resolve())
const invalidateAll = vi.fn()

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))
vi.mock("@/features/templates/lib/use-invalidate-template-kinds", () => ({
  useInvalidateAfterTemplateChange: () => ({ invalidateLocks, invalidateAll }),
}))

let visibility: DocumentVisibilityState = "visible"
let root: Root | null = null

const setVisibility = (state: DocumentVisibilityState) => {
  visibility = state
  document.dispatchEvent(new Event("visibilitychange"))
}

beforeEach(() => {
  vi.useFakeTimers()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  })
  visibility = "visible"
  root = createRoot(document.createElement("div"))
  act(() => root?.render(<InstallProgressRefresher />))
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("install progress polling", () => {
  test("refreshes on every tick while the tab is visible", () => {
    vi.advanceTimersByTime(6000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  test("skips ticks while hidden and refreshes once when shown again", () => {
    setVisibility("hidden")
    vi.advanceTimersByTime(9000)
    expect(refresh).not.toHaveBeenCalled()

    setVisibility("visible")
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  test("drops the cached lock badges and resource lists when polling stops", () => {
    act(() => root?.unmount())
    root = null
    expect(invalidateLocks).toHaveBeenCalledTimes(1)
    expect(invalidateAll).toHaveBeenCalledTimes(1)
  })
})
