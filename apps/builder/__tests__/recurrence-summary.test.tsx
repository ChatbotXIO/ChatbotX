import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import messages from "../messages/en.json"
import { RecurrenceSummary } from "../src/components/recurrence/recurrence-summary"

const RULE = {
  frequency: "daily" as const,
  interval: 1,
  timeOfDay: "09:30",
  timezone: "UTC",
  startsOn: "2026-10-15",
  end: { kind: "afterOccurrences" as const, count: 3 },
}

describe("RecurrenceSummary", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-15T09:00:00Z"))
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.useRealTimers()
  })

  const render = (props: Partial<Parameters<typeof RecurrenceSummary>[0]>) => {
    act(() => {
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <RecurrenceSummary rule={RULE} {...props} />
        </NextIntlClientProvider>,
      )
    })
    return container.textContent ?? ""
  }

  test("lists the runs a new series will make", () => {
    const text = render({})
    expect(text).toContain("Next runs")
    expect(text).toContain("Thu, Oct 15, 2026")
    expect(text).toContain("Sat, Oct 17, 2026")
  })

  test("counts from the runs already made", () => {
    // 2 of 3 are done: one run is left.
    const text = render({ occurrenceCount: 2 })
    expect(text).toContain("Thu, Oct 15, 2026")
    expect(text).not.toContain("Fri, Oct 16, 2026")
  })

  test("a finished count promises nothing", () => {
    expect(render({ occurrenceCount: 3 })).toContain("No upcoming runs.")
  })

  test("a paused or ended series shows only the rule, no upcoming runs", () => {
    const text = render({ showUpcoming: false, occurrenceCount: 2 })
    expect(text).toContain("Every day at 09:30")
    expect(text).not.toContain("Next runs")
    expect(text).not.toContain("No upcoming runs.")
  })
  test("names the skipped dates and leaves them out of the next runs", () => {
    const text = render({
      rule: { ...RULE, excludeDates: ["2026-10-16"] },
    })
    expect(text).toContain("Skipping Oct 16, 2026")
    expect(text).toContain("Thu, Oct 15, 2026")
    expect(text).not.toContain("Fri, Oct 16, 2026")
    expect(text).toContain("Sat, Oct 17, 2026")
  })

  test("shortens a long list of skipped dates", () => {
    const text = render({
      rule: {
        ...RULE,
        end: { kind: "never" },
        excludeDates: [
          "2026-12-24",
          "2026-12-25",
          "2026-12-26",
          "2026-12-27",
          "2026-12-28",
        ],
      },
    })
    expect(text).toContain("Dec 24, 2026, Dec 25, 2026, and Dec 26, 2026")
    expect(text).toContain("(+2 more)")
  })
})
