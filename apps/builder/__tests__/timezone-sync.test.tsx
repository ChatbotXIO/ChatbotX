import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}))

const setUserTimezone = vi.fn(async (_timezone: string) => undefined)
vi.mock("@/lib/timezone.action", () => ({
  setUserTimezone: (timezone: string) => setUserTimezone(timezone),
}))

import { TimezoneSync } from "@/components/timezone-sync"

const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
// Two valid zones that are not the one this test process runs in, so the
// assertions hold whether CI runs in UTC, Saigon or anywhere else.
const [otherTimezone, anotherTimezone] = [
  "Pacific/Kiritimati",
  "UTC",
  "Asia/Tokyo",
].filter((zone) => zone !== browserTimezone) as [string, string]

let root: Root | null = null
let container: HTMLDivElement | null = null

// Awaited so the effect's async transition (server action, then refresh)
// settles before assertions run.
const rerender = (timezone: string) =>
  act(() => {
    root?.render(<TimezoneSync timezone={timezone} />)
  })

const render = (timezone: string) => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  return rerender(timezone)
}

describe("TimezoneSync", () => {
  beforeEach(() => {
    refresh.mockClear()
    setUserTimezone.mockClear()
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    container?.remove()
    root = null
    container = null
  })

  test("does nothing when the server already resolved the browser's zone", async () => {
    await render(browserTimezone)
    expect(setUserTimezone).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  test("stores the browser's zone and refreshes when the server used another zone", async () => {
    await render(otherTimezone)
    expect(setUserTimezone).toHaveBeenCalledWith(browserTimezone)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  test("retries on a later render when the server action failed, without refreshing", async () => {
    setUserTimezone.mockRejectedValueOnce(new Error("network down"))
    await render(otherTimezone)
    expect(refresh).not.toHaveBeenCalled()

    // A later server render (e.g. navigation) still reports a wrong zone.
    await rerender(anotherTimezone)
    expect(setUserTimezone).toHaveBeenCalledTimes(2)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  test("syncs at most once per mount so a rejected cookie cannot loop", async () => {
    await render(otherTimezone)
    // The refresh came back with the same (unchanged) server zone.
    await rerender(otherTimezone)
    expect(setUserTimezone).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
