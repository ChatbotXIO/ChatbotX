import type { BroadcastCalendarRow } from "@chatbotx.io/business"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { BroadcastsCalendar } from "@/features/broadcasts/components/broadcasts-calendar"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  useFormatter: () => ({
    dateTime: (date: Date) => date.toISOString().slice(0, 10),
  }),
}))

const setQuery = vi.fn()
vi.mock("nuqs", () => ({
  useQueryStates: () => [{ month: "2026-08" }, setQuery],
}))

vi.mock("@/features/broadcasts/broadcast-detail-dialog", () => ({
  BroadcastDetailDialog: ({
    broadcast,
    open,
  }: {
    broadcast: { id: string } | null
    open: boolean
  }) => (
    <div
      data-id={broadcast?.id ?? ""}
      data-open={String(open)}
      data-testid="detail"
    />
  ),
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

function renderCalendar(ui: React.ReactElement) {
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
  setQuery.mockReset()
})

const makeRow = (
  id: string,
  status: string,
  schedulesAt: Date,
): BroadcastCalendarRow =>
  ({
    id,
    name: `Broadcast ${id}`,
    status,
    schedulesAt,
  }) as unknown as BroadcastCalendarRow

// August 31, 2026 is a Monday, which starts a new calendar week under the
// grid's Monday-start convention — so it renders in its own (current-month)
// cell, distinct from the leading July 31 cell that also reads "31".
const AUG_31 = new Date("2026-08-31T00:00:00Z")
const SEP_2 = new Date("2026-09-02T00:00:00Z")

const fourRowsOnAug31 = [
  makeRow("b-scheduled", "scheduled", AUG_31),
  makeRow("b-sending", "sending", AUG_31),
  makeRow("b-sent", "sent", AUG_31),
  makeRow("b-failed", "failed", AUG_31),
]
const rowOnSep2 = makeRow("b-sep", "scheduled", SEP_2)

/** Finds the day-of-month cell for the currently displayed month (not a leading/trailing day from an adjacent month, which can share the same day-of-month text, e.g. both July 31 and August 31 render "31"). */
function findCurrentMonthDayCell(
  el: HTMLElement,
  dayLabel: string,
): HTMLElement {
  const daySpans = Array.from(el.querySelectorAll<HTMLElement>("span.self-end"))
  const match = daySpans.find(
    (span) =>
      span.textContent === dayLabel &&
      !span.parentElement?.className.includes("text-muted-foreground"),
  )
  if (!match?.parentElement) {
    throw new Error(`day cell "${dayLabel}" not found`)
  }
  return match.parentElement
}

describe("BroadcastsCalendar", () => {
  test("renders at most 3 chips for 08-31 and the overflow label", () => {
    const el = renderCalendar(
      <BroadcastsCalendar
        broadcasts={[...fourRowsOnAug31, rowOnSep2]}
        month="2026-08"
      />,
    )
    const cell = findCurrentMonthDayCell(el, "31")
    const chips = cell.querySelectorAll("button")
    expect(chips.length).toBe(3)
    expect(cell.textContent).toContain('broadcasts.calendar.more:{"count":1}')
  })

  test("clicking the first chip opens the detail dialog for that row", () => {
    const el = renderCalendar(
      <BroadcastsCalendar
        broadcasts={[...fourRowsOnAug31, rowOnSep2]}
        month="2026-08"
      />,
    )
    const cell = findCurrentMonthDayCell(el, "31")
    const firstChip = cell.querySelectorAll("button")[0] as HTMLButtonElement

    const detailBefore = el.querySelector('[data-testid="detail"]')
    expect(detailBefore?.getAttribute("data-open")).toBe("false")

    act(() => {
      firstChip.click()
    })

    const detailAfter = el.querySelector('[data-testid="detail"]')
    expect(detailAfter?.getAttribute("data-open")).toBe("true")
    expect(detailAfter?.getAttribute("data-id")).toBe("b-scheduled")
  })

  test("previous/next/today navigate via setQuery", () => {
    const el = renderCalendar(
      <BroadcastsCalendar broadcasts={[]} month="2026-08" />,
    )

    const previous = el.querySelector(
      '[aria-label="broadcasts.calendar.previousMonth"]',
    ) as HTMLButtonElement
    act(() => {
      previous.click()
    })
    expect(setQuery).toHaveBeenCalledWith({ month: "2026-07" })

    const next = el.querySelector(
      '[aria-label="broadcasts.calendar.nextMonth"]',
    ) as HTMLButtonElement
    act(() => {
      next.click()
    })
    expect(setQuery).toHaveBeenCalledWith({ month: "2026-09" })

    const today = Array.from(el.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "broadcasts.calendar.today",
    ) as HTMLButtonElement
    act(() => {
      today.click()
    })
    expect(setQuery).toHaveBeenCalledWith({ month: null })
  })

  test("a row with an unknown status renders a chip without a status dot", () => {
    const unknownStatusRow = makeRow(
      "b-unknown",
      "some-unrecognized-status",
      new Date("2026-08-05T00:00:00Z"),
    )
    const el = renderCalendar(
      <BroadcastsCalendar broadcasts={[unknownStatusRow]} month="2026-08" />,
    )
    const cell = findCurrentMonthDayCell(el, "5")
    const chip = cell.querySelector("button") as HTMLButtonElement
    expect(chip).toBeTruthy()
    expect(chip.querySelector("[aria-hidden]")).toBeNull()
  })
})
