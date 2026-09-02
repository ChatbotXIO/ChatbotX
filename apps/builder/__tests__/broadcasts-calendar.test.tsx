import type { BroadcastCalendarRow } from "@chatbotx.io/business"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { BroadcastsCalendar } from "@/features/broadcasts/components/broadcasts-calendar"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  useFormatter: () => ({
    dateTime: (date: Date, options?: Record<string, unknown>) => {
      if (options?.hour) {
        return date.toISOString().slice(11, 16)
      }
      return date.toISOString().slice(0, 10)
    },
    dateTimeRange: (from: Date, to: Date) =>
      `${from.toISOString().slice(0, 10)}..${to.toISOString().slice(0, 10)}`,
  }),
}))

const setQuery = vi.fn()
vi.mock("nuqs", () => ({
  useQueryStates: () => [{ date: "2026-08-01", range: "month" }, setQuery],
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

vi.mock("@chatbotx.io/ui/components/ui/calendar", () => ({
  Calendar: () => <div data-testid="jump-calendar" />,
}))

vi.mock("@chatbotx.io/ui/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ render }: { render: React.ReactElement }) => render,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/toggle-group", async () => {
  const React = await import("react")
  const ToggleGroupContext = React.createContext<{
    onValueChange?: (vals: string[]) => void
  }>({})

  function ToggleGroup({
    children,
    onValueChange,
  }: {
    children: React.ReactNode
    onValueChange: (vals: string[]) => void
  }) {
    return (
      <ToggleGroupContext.Provider value={{ onValueChange }}>
        <div data-testid="toggle-group">{children}</div>
      </ToggleGroupContext.Provider>
    )
  }

  function ToggleGroupItem({
    children,
    value,
  }: {
    children: React.ReactNode
    value: string
  }) {
    const { onValueChange } = React.useContext(ToggleGroupContext)
    return (
      <button
        data-value={value}
        onClick={() => onValueChange?.([value])}
        type="button"
      >
        {children}
      </button>
    )
  }

  return { ToggleGroup, ToggleGroupItem }
})

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
  name?: string,
): BroadcastCalendarRow =>
  ({
    id,
    name: name ?? `Broadcast ${id}`,
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

describe("BroadcastsCalendar month view", () => {
  test("renders at most 3 chips for 08-31 and the overflow label", () => {
    const el = renderCalendar(
      <BroadcastsCalendar
        broadcasts={[...fourRowsOnAug31, rowOnSep2]}
        date="2026-08-01"
        range="month"
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
        date="2026-08-01"
        range="month"
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

  test("previous/next/today navigate via setQuery by whole months", () => {
    const el = renderCalendar(
      <BroadcastsCalendar broadcasts={[]} date="2026-08-01" range="month" />,
    )

    const previous = el.querySelector(
      '[aria-label="broadcasts.calendar.previous"]',
    ) as HTMLButtonElement
    act(() => {
      previous.click()
    })
    expect(setQuery).toHaveBeenCalledWith({ date: "2026-07-01" })

    const next = el.querySelector(
      '[aria-label="broadcasts.calendar.next"]',
    ) as HTMLButtonElement
    act(() => {
      next.click()
    })
    expect(setQuery).toHaveBeenCalledWith({ date: "2026-09-01" })

    const today = Array.from(el.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "broadcasts.calendar.today",
    ) as HTMLButtonElement
    act(() => {
      today.click()
    })
    expect(setQuery).toHaveBeenCalledWith({ date: null })
  })

  test("a row with an unknown status renders a chip without a status dot", () => {
    const unknownStatusRow = makeRow(
      "b-unknown",
      "some-unrecognized-status",
      new Date("2026-08-05T00:00:00Z"),
    )
    const el = renderCalendar(
      <BroadcastsCalendar
        broadcasts={[unknownStatusRow]}
        date="2026-08-01"
        range="month"
      />,
    )
    const cell = findCurrentMonthDayCell(el, "5")
    const chip = cell.querySelector("button") as HTMLButtonElement
    expect(chip).toBeTruthy()
    expect(chip.querySelector("[aria-hidden]")).toBeNull()
  })
})

describe("BroadcastsCalendar range toggle", () => {
  test("renders 3 range options and writes setQuery({ range }) on click", () => {
    const el = renderCalendar(
      <BroadcastsCalendar broadcasts={[]} date="2026-08-01" range="month" />,
    )
    const toggleGroup = el.querySelector(
      '[data-testid="toggle-group"]',
    ) as HTMLElement
    const options = toggleGroup.querySelectorAll("button")
    expect(options.length).toBe(3)
    expect(
      Array.from(options).map((o) => o.getAttribute("data-value")),
    ).toEqual(["month", "week", "day"])

    const weekOption = Array.from(options).find(
      (o) => o.getAttribute("data-value") === "week",
    ) as HTMLButtonElement
    act(() => {
      weekOption.click()
    })
    expect(setQuery).toHaveBeenCalledWith({ range: "week" })
  })
})

describe("BroadcastsCalendar week view", () => {
  test("shows a chip's HH:mm before the name and does not cap chips per day", () => {
    const rowsOnAug31 = [
      makeRow("w-1", "scheduled", new Date("2026-08-31T09:15:00Z"), "First"),
      makeRow("w-2", "scheduled", new Date("2026-08-31T14:00:00Z"), "Second"),
      makeRow("w-3", "scheduled", new Date("2026-08-31T18:30:00Z"), "Third"),
      makeRow("w-4", "scheduled", new Date("2026-08-31T20:00:00Z"), "Fourth"),
    ]
    const el = renderCalendar(
      <BroadcastsCalendar
        broadcasts={rowsOnAug31}
        date="2026-09-02"
        range="week"
      />,
    )
    const chips = Array.from(el.querySelectorAll("button")).filter(
      (b) =>
        b.textContent?.includes("First") ||
        b.textContent?.includes("Second") ||
        b.textContent?.includes("Third") ||
        b.textContent?.includes("Fourth"),
    )
    expect(chips.length).toBe(4)
    expect(chips[0].textContent).toContain("09:15")
    expect(chips[0].textContent).toContain("First")
  })

  test("previous/next in week mode write the date ±7 days", () => {
    const el = renderCalendar(
      <BroadcastsCalendar broadcasts={[]} date="2026-09-02" range="week" />,
    )

    const next = el.querySelector(
      '[aria-label="broadcasts.calendar.next"]',
    ) as HTMLButtonElement
    act(() => {
      next.click()
    })
    expect(setQuery).toHaveBeenCalledWith({ date: "2026-09-09" })

    const previous = el.querySelector(
      '[aria-label="broadcasts.calendar.previous"]',
    ) as HTMLButtonElement
    act(() => {
      previous.click()
    })
    expect(setQuery).toHaveBeenCalledWith({ date: "2026-08-26" })

    const today = Array.from(el.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "broadcasts.calendar.today",
    ) as HTMLButtonElement
    act(() => {
      today.click()
    })
    expect(setQuery).toHaveBeenCalledWith({ date: null })
  })
})

describe("BroadcastsCalendar day view", () => {
  test("lists rows sorted by time and opens the dialog on click", () => {
    const rows = [
      makeRow("d-2", "scheduled", new Date("2026-09-02T14:00:00Z"), "Later"),
      makeRow("d-1", "scheduled", new Date("2026-09-02T09:00:00Z"), "Earlier"),
    ]
    const el = renderCalendar(
      <BroadcastsCalendar broadcasts={rows} date="2026-09-02" range="day" />,
    )
    const rowButtons = Array.from(
      el.querySelectorAll('[class*="divide-y"] button'),
    )
    expect(rowButtons.map((b) => b.textContent)).toEqual([
      expect.stringContaining("Earlier"),
      expect.stringContaining("Later"),
    ])

    act(() => {
      ;(rowButtons[0] as HTMLButtonElement).click()
    })
    const detailAfter = el.querySelector('[data-testid="detail"]')
    expect(detailAfter?.getAttribute("data-open")).toBe("true")
    expect(detailAfter?.getAttribute("data-id")).toBe("d-1")
  })

  test("shows the empty-day message when there are no broadcasts that day", () => {
    const el = renderCalendar(
      <BroadcastsCalendar broadcasts={[]} date="2026-09-02" range="day" />,
    )
    expect(el.textContent).toContain("broadcasts.calendar.emptyDay")
  })
})
