import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import messages from "../messages/en.json"
import { BroadcastSeriesSummary } from "../src/features/broadcasts/components/broadcast-series-summary"
import type { BroadcastResourceWithRelations } from "../src/features/broadcasts/schema/resource"

const RULE = {
  frequency: "daily" as const,
  interval: 1,
  timeOfDay: "09:00",
  timezone: "Asia/Ho_Chi_Minh",
  startsOn: "2026-10-14",
  end: { kind: "never" as const },
}

type SummaryBroadcast = Parameters<
  typeof BroadcastSeriesSummary
>[0]["broadcast"]

const series = (
  overrides: Partial<NonNullable<BroadcastResourceWithRelations["recurrence"]>>,
  broadcast: Partial<SummaryBroadcast> = {},
): SummaryBroadcast => ({
  status: "recurring",
  schedulesType: "recurring",
  occurrenceAt: null,
  recurrence: {
    id: "r-1",
    rule: RULE,
    nextRunAt: new Date("2026-10-16T02:00:00Z"),
    occurrenceCount: 3,
    lastOccurrenceAt: new Date("2026-10-15T02:00:00Z"),
    pausedAt: null,
    endedAt: null,
    ...overrides,
  },
  ...broadcast,
})

describe("BroadcastSeriesSummary", () => {
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

  const render = (broadcast: SummaryBroadcast) => {
    act(() => {
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <BroadcastSeriesSummary broadcast={broadcast} />
        </NextIntlClientProvider>,
      )
    })
    return container.textContent ?? ""
  }

  test("shows the next run in the series' own timezone", () => {
    // 02:00Z is 09:00 in Ho Chi Minh City, whatever zone the viewer is in.
    const text = render(series({}))
    expect(text).toContain("Next run")
    expect(text).toContain("Fri, Oct 16")
    expect(text).toContain("09:00")
  })

  test("says paused for a paused series", () => {
    expect(
      render(
        series(
          { nextRunAt: null, pausedAt: new Date("2026-10-15T01:00:00Z") },
          { status: "cancelled" },
        ),
      ),
    ).toBe("Paused")
  })

  test("says paused for a cancelled series even before the pause stamp is read", () => {
    expect(render(series({ nextRunAt: null }, { status: "cancelled" }))).toBe(
      "Paused",
    )
  })

  test("says when an ended series ended and how many runs it made", () => {
    const text = render(
      series(
        { nextRunAt: null, endedAt: new Date("2026-10-20T02:00:00Z") },
        { status: "sent" },
      ),
    )
    expect(text).toContain("Ended")
    expect(text).toContain("Oct 20, 2026")
    expect(text).toContain("3 runs")
  })

  test("uses the singular for a single run", () => {
    expect(
      render(
        series(
          {
            nextRunAt: null,
            endedAt: new Date("2026-10-20T02:00:00Z"),
            occurrenceCount: 1,
          },
          { status: "sent" },
        ),
      ),
    ).toContain("1 run")
  })

  test("renders nothing for a draft series with no schedule yet", () => {
    expect(render(series({ nextRunAt: null }, { status: "draft" }))).toBe("")
  })

  test("renders nothing for a one-off", () => {
    expect(
      render({
        status: "scheduled",
        schedulesType: "future",
        occurrenceAt: null,
        recurrence: null,
      }),
    ).toBe("")
  })

  test("renders nothing for a run of a series", () => {
    expect(
      render(series({}, { occurrenceAt: new Date("2026-10-15T02:00:00Z") })),
    ).toBe("")
  })
})
