// @vitest-environment jsdom
import { formatInTimeZone } from "date-fns-tz"
import { act } from "react"
import { createRoot, hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}))
// Only the selects are stubbed; the date control and its preset logic are real.
vi.mock("@chatbotx.io/ui/components/ui/select", () => ({
  Select: () => null,
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: () => null,
  SelectItem: () => null,
}))

import { StatsFilters } from "@/features/integration-google-ads/components/stats/stats-filters"

const TRIGGER = "#date-range-preset"
const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const CREATED_AT = new Date("2026-01-01T00:00:00Z")

/**
 * The zones (a fixed offset each, no DST) the runtime's own zone is farthest
 * from, so two instants an hour apart around the RUNTIME's local midnight are
 * the same calendar day in the returned zone: the runtime disagrees with itself
 * about the day, the range's zone does not.
 */
const zoneFarFromRuntimeMidnight = (): string => {
  const runtimeOffsetHours = -new Date().getTimezoneOffset() / 60
  const zones = [
    { tz: "Etc/GMT-12", offset: 12 },
    { tz: "UTC", offset: 0 },
    { tz: "Etc/GMT+12", offset: -12 },
  ]
  const distance = (offset: number) => {
    const diff = Math.abs(offset - runtimeOffsetHours) % 24
    return Math.min(diff, 24 - diff)
  }
  return zones.reduce((best, zone) =>
    distance(zone.offset) > distance(best.offset) ? zone : best,
  ).tz
}

/** The next instant that is 00:30 on the runtime's local clock. */
const justAfterLocalMidnight = (): Date => {
  const instant = new Date("2026-10-08T12:00:00Z")
  instant.setHours(0, 30, 0, 0)
  return instant
}

const dayKey = (instant: Date, tz: string, offsetDays = 0) =>
  formatInTimeZone(
    new Date(instant.getTime() + offsetDays * DAY_MS),
    tz,
    "yyyy-MM-dd",
  )

const filters = (
  range: { from: string; to: string; tz: string },
  referenceNow = new Date().toISOString(),
) => (
  <StatsFilters
    action={null}
    actions={[]}
    channel={null}
    onParamChange={vi.fn()}
    onRangeChange={vi.fn()}
    range={range}
    referenceNow={referenceNow}
    workspaceCreatedAt={CREATED_AT}
  />
)

const triggerText = (root: ParentNode) =>
  root.querySelector(TRIGGER)?.textContent

let errors: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers({ toFake: ["Date"] })
  errors = vi.spyOn(console, "error").mockImplementation(() => undefined)
})
afterEach(() => {
  vi.useRealTimers()
  errors.mockRestore()
})

const hydrate = (input: {
  serverNow: Date
  browserNow: Date
  range: { from: string; to: string; tz: string }
}) => {
  vi.setSystemTime(input.serverNow)
  // The page captures ONE instant per request and ships it to the browser.
  const referenceNow = input.serverNow.toISOString()
  const markup = renderToString(filters(input.range, referenceNow))
  vi.setSystemTime(input.browserNow)
  const container = document.createElement("div")
  container.innerHTML = markup
  document.body.append(container)
  const recoverable = vi.fn()
  const observed: string[] = []
  const observer = new MutationObserver(() => undefined)
  observer.observe(container, {
    childList: true,
    subtree: true,
    characterData: true,
  })
  const serverLabel = triggerText(container)
  act(() => {
    hydrateRoot(container, filters(input.range, referenceNow), {
      onRecoverableError: recoverable,
    })
  })
  const clientLabel = triggerText(container)
  observed.push(...observer.takeRecords().map((record) => record.type))
  observer.disconnect()
  container.remove()
  return { markup, serverLabel, clientLabel, recoverable, mutations: observed }
}

describe("StatsFilters preset hydration", () => {
  test("hydrates with the same label as the server markup, with the final preset label from the first paint", () => {
    const tz = zoneFarFromRuntimeMidnight()
    const now = justAfterLocalMidnight()
    const range = { from: dayKey(now, tz, -6), to: dayKey(now, tz), tz }

    const result = hydrate({ serverNow: now, browserNow: now, range })

    expect(result.serverLabel).toBe("fields.last7days.label")
    expect(result.clientLabel).toBe(result.serverLabel)
    expect(result.recoverable).not.toHaveBeenCalled()
    expect(errors).not.toHaveBeenCalled()
    expect(result.mutations).toEqual([])
  })

  test("a server and a browser that disagree about the runtime's local day still agree through range.tz", () => {
    const tz = zoneFarFromRuntimeMidnight()
    const browserNow = justAfterLocalMidnight()
    const serverNow = new Date(browserNow.getTime() - HOUR_MS)
    // Sanity: the runtime really does see two different days.
    expect(serverNow.getDate()).not.toBe(browserNow.getDate())
    expect(dayKey(serverNow, tz)).toBe(dayKey(browserNow, tz))
    const range = {
      from: dayKey(browserNow, tz, -6),
      to: dayKey(browserNow, tz),
      tz,
    }

    const result = hydrate({ serverNow, browserNow, range })

    expect(result.markup).toContain("fields.last7days.label")
    expect(result.clientLabel).toBe(result.serverLabel)
    expect(result.recoverable).not.toHaveBeenCalled()
    expect(errors).not.toHaveBeenCalled()
  })

  test("a hydration that crosses midnight in range.tz keeps the server's label", () => {
    const tz = "Asia/Ho_Chi_Minh"
    // 23:59:59.900 on Oct 8 in Vietnam, then 200 ms later it is Oct 9.
    const serverNow = new Date("2026-10-08T16:59:59.900Z")
    const browserNow = new Date(serverNow.getTime() + 200)
    const range = { from: "2026-10-02", to: "2026-10-08", tz }
    expect(dayKey(serverNow, tz)).toBe("2026-10-08")
    expect(dayKey(browserNow, tz)).toBe("2026-10-09")

    const result = hydrate({ serverNow, browserNow, range })

    expect(result.serverLabel).toBe("fields.last7days.label")
    expect(result.clientLabel).toBe(result.serverLabel)
    expect(result.recoverable).not.toHaveBeenCalled()
    expect(errors).not.toHaveBeenCalled()
    expect(result.mutations).toEqual([])
  })

  test("a range that is no named preset renders as custom on the server and the browser alike", () => {
    const tz = zoneFarFromRuntimeMidnight()
    const now = justAfterLocalMidnight()
    const range = { from: dayKey(now, tz, -40), to: dayKey(now, tz, -35), tz }

    const result = hydrate({ serverNow: now, browserNow: now, range })

    expect(result.markup).not.toContain("fields.last")
    expect(result.clientLabel).toBe(result.serverLabel)
    expect(errors).not.toHaveBeenCalled()
  })

  test("the zone decides the day: the same range is Last 7 days in one zone and custom in another", () => {
    vi.setSystemTime(new Date("2026-10-07T17:30:00Z"))
    const range = { from: "2026-10-01", to: "2026-10-07" }

    const inUtc = renderToString(filters({ ...range, tz: "UTC" }))
    const inVietnam = renderToString(
      filters({ ...range, tz: "Asia/Ho_Chi_Minh" }),
    )

    expect(inUtc).toContain("fields.last7days.label")
    expect(inVietnam).not.toContain("fields.last7days.label")
  })

  test("a range change shows the final label at once: the server markup has it and the control remounts once", () => {
    const tz = zoneFarFromRuntimeMidnight()
    const now = justAfterLocalMidnight()
    vi.setSystemTime(now)
    const last7 = { from: dayKey(now, tz, -6), to: dayKey(now, tz), tz }
    const yesterday = {
      from: dayKey(now, tz, -1),
      to: dayKey(now, tz, -1),
      tz,
    }

    expect(renderToString(filters(yesterday))).toContain(
      "fields.yesterday.label",
    )

    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(filters(last7)))
    expect(triggerText(container)).toBe("fields.last7days.label")

    const observer = new MutationObserver(() => undefined)
    observer.observe(container, { childList: true, subtree: true })
    act(() => root.render(filters(yesterday)))
    // Each control the range change mounted, with the label it carried.
    const mountedLabels = observer
      .takeRecords()
      .flatMap((record) => Array.from(record.addedNodes))
      .filter((node): node is Element => node instanceof Element)
      .map((node) => node.querySelector(TRIGGER)?.textContent)
      .filter(Boolean)
    observer.disconnect()

    expect(mountedLabels).toEqual(["fields.yesterday.label"])
    expect(triggerText(container)).toBe("fields.yesterday.label")
    expect(errors).not.toHaveBeenCalled()
    act(() => root.unmount())
    container.remove()
  })
})
