import type { BroadcastCalendarRow } from "@chatbotx.io/business"
import { addDays, format } from "date-fns"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { BroadcastsCalendar } from "@/features/broadcasts/components/broadcasts-calendar"
import { MAX_CUSTOM_RANGE_DAYS } from "@/features/broadcasts/lib/calendar-grid"

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

type CalendarRangeValue = { from?: Date; to?: Date }

const RANGE_PICK_FROM = new Date("2027-01-10T00:00:00")
const RANGE_PICK_TO = new Date("2027-01-15T00:00:00")
// Beyond the 92-day cap from RANGE_PICK_FROM, for the clamp test.
const RANGE_PICK_TO_FAR_FUTURE = new Date("2027-08-01T00:00:00")

// Local-time (not UTC) yyyy-MM-dd, matching how `anchor`/`endAnchor` are
// built (date-fns `parse`/`format`, both local-time based) — avoids the
// UTC-conversion date-shift `.toISOString()` would introduce east of UTC.
const toLocalDateString = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

vi.mock("@chatbotx.io/ui/components/ui/calendar", () => ({
  // Mirrors real react-day-picker 9.14's `resetOnSelect` + fully-controlled
  // `selected` semantics: a click completes the range when `selected` is
  // already partial (`from` set, no `to`); otherwise it starts a fresh
  // partial range. No internal click-count state — it reads `selected` on
  // every click, exactly like the real DayPicker's `addToRange` does.
  Calendar: (props: {
    classNames?: Record<string, string>
    endMonth?: Date
    mode?: string
    onSelect?: (value: Date | CalendarRangeValue | undefined) => void
    selected?: Date | CalendarRangeValue
    showOutsideDays?: boolean
    startMonth?: Date
  }) => (
    <div
      data-class-names={
        props.classNames ? JSON.stringify(props.classNames) : undefined
      }
      data-end-month={props.endMonth?.toISOString()}
      data-mode={props.mode}
      data-selected={
        props.mode === "range"
          ? JSON.stringify({
              from:
                (props.selected as CalendarRangeValue | undefined)?.from &&
                toLocalDateString(
                  (props.selected as CalendarRangeValue).from as Date,
                ),
              to:
                ((props.selected as CalendarRangeValue | undefined)?.to &&
                  toLocalDateString(
                    (props.selected as CalendarRangeValue).to as Date,
                  )) ??
                null,
            })
          : undefined
      }
      data-show-outside-days={
        props.showOutsideDays === undefined
          ? undefined
          : String(props.showOutsideDays)
      }
      data-start-month={props.startMonth?.toISOString()}
      data-testid="jump-calendar"
    >
      <button
        data-testid="jump-day"
        onClick={() => {
          if (props.mode !== "range") {
            props.onSelect?.(RANGE_PICK_TO)
            return
          }
          const sel = props.selected as CalendarRangeValue | undefined
          if (sel?.from && !sel?.to) {
            props.onSelect?.({ from: sel.from, to: RANGE_PICK_TO })
          } else {
            props.onSelect?.({ from: RANGE_PICK_FROM, to: undefined })
          }
        }}
        type="button"
      >
        pick date
      </button>
      {props.mode === "range" && (
        <button
          data-testid="jump-day-far-future"
          onClick={() =>
            props.onSelect?.({
              from: RANGE_PICK_FROM,
              to: RANGE_PICK_TO_FAR_FUTURE,
            })
          }
          type="button"
        >
          pick far future
        </button>
      )}
    </div>
  ),
}))

// Stands in for the real Base UI popover primitives (portal + positioning
// logic that would otherwise make this test depend on real DOM measurement
// and animation timing). Mirrors the contract `BroadcastsCalendar` relies
// on: a controlled `open`/`onOpenChange` pair on `Popover`, a trigger whose
// click *requests* an open, and content that only renders while open — so
// the "closes the popover after a pick" assertion is meaningful.
type PopoverContextValue = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

vi.mock("@chatbotx.io/ui/components/ui/popover", async () => {
  const React = await import("react")
  const PopoverContext = React.createContext<PopoverContextValue>({
    open: false,
    onOpenChange: () => {
      // no-op default
    },
  })

  function Popover({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode
    open: boolean
    onOpenChange: (open: boolean) => void
  }) {
    return (
      <PopoverContext.Provider value={{ open, onOpenChange }}>
        {children}
      </PopoverContext.Provider>
    )
  }

  function PopoverTrigger({
    render,
  }: {
    render: React.ReactElement<{ onClick?: (event: unknown) => void }>
  }) {
    const { onOpenChange } = React.useContext(PopoverContext)
    return React.cloneElement(render, {
      onClick: (event: unknown) => {
        render.props.onClick?.(event)
        onOpenChange(true)
      },
    })
  }

  function PopoverContent({
    children,
  }: {
    anchor?: unknown
    children: React.ReactNode
  }) {
    const { open, onOpenChange } = React.useContext(PopoverContext)
    return open ? (
      <div data-testid="popover-content">
        {children}
        {/* Stands in for any real dismiss path (outside click, Escape) that
         * calls `onOpenChange(false)` without going through Apply. */}
        <button
          data-testid="popover-dismiss"
          onClick={() => onOpenChange(false)}
          type="button"
        >
          dismiss
        </button>
      </div>
    ) : null
  }

  return { Popover, PopoverTrigger, PopoverContent }
})

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
    onClick,
    value,
  }: {
    children: React.ReactNode
    onClick?: () => void
    value: string
  }) {
    const { onValueChange } = React.useContext(ToggleGroupContext)
    return (
      <button
        data-value={value}
        onClick={() => {
          onClick?.()
          onValueChange?.([value])
        }}
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

/** Locates the range picker's Apply button by its translated label. */
function findApplyButton(el: HTMLElement): HTMLButtonElement {
  const button = Array.from(el.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "broadcasts.calendar.apply",
  )
  if (!button) {
    throw new Error("Apply button not found")
  }
  return button as HTMLButtonElement
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
        endDate="2026-08-01"
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
        endDate="2026-08-01"
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
      <BroadcastsCalendar
        broadcasts={[]}
        date="2026-08-01"
        endDate="2026-08-01"
        range="month"
      />,
    )

    const previous = el.querySelector(
      '[aria-label="broadcasts.calendar.previous"]',
    ) as HTMLButtonElement
    act(() => {
      previous.click()
    })
    expect(setQuery).toHaveBeenCalledWith({
      date: "2026-07-01",
      endDate: null,
    })

    const next = el.querySelector(
      '[aria-label="broadcasts.calendar.next"]',
    ) as HTMLButtonElement
    act(() => {
      next.click()
    })
    expect(setQuery).toHaveBeenCalledWith({
      date: "2026-09-01",
      endDate: null,
    })

    const today = Array.from(el.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "broadcasts.calendar.today",
    ) as HTMLButtonElement
    act(() => {
      today.click()
    })
    expect(setQuery).toHaveBeenCalledWith({ date: null, endDate: null })
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
        endDate="2026-08-01"
        range="month"
      />,
    )
    const cell = findCurrentMonthDayCell(el, "5")
    const chip = cell.querySelector("button") as HTMLButtonElement
    expect(chip).toBeTruthy()
    expect(chip.querySelector("[aria-hidden]")).toBeNull()
  })
})

describe("BroadcastsCalendar jump picker", () => {
  test("picking a day writes setQuery({ date, endDate: null }) and closes the popover", () => {
    const el = renderCalendar(
      <BroadcastsCalendar
        broadcasts={[]}
        date="2026-08-01"
        endDate="2026-08-01"
        range="month"
      />,
    )

    const trigger = el.querySelector(
      '[aria-label="broadcasts.calendar.jumpToDate"]',
    ) as HTMLButtonElement
    act(() => {
      trigger.click()
    })
    expect(el.querySelector('[data-testid="popover-content"]')).not.toBeNull()

    const jumpDay = el.querySelector(
      '[data-testid="jump-day"]',
    ) as HTMLButtonElement
    act(() => {
      jumpDay.click()
    })

    expect(setQuery).toHaveBeenCalledWith({
      date: "2027-01-15",
      endDate: null,
    })
    expect(el.querySelector('[data-testid="popover-content"]')).toBeNull()
  })

  test("the jump picker's endMonth reaches at least 3 years into the future", () => {
    const el = renderCalendar(
      <BroadcastsCalendar
        broadcasts={[]}
        date="2026-08-01"
        endDate="2026-08-01"
        range="month"
      />,
    )

    const trigger = el.querySelector(
      '[aria-label="broadcasts.calendar.jumpToDate"]',
    ) as HTMLButtonElement
    act(() => {
      trigger.click()
    })

    const calendar = el.querySelector(
      '[data-testid="jump-calendar"]',
    ) as HTMLElement
    const endMonthAttr = calendar.getAttribute("data-end-month")
    expect(endMonthAttr).toBeTruthy()
    const endMonth = new Date(endMonthAttr as string)
    const now = new Date()
    expect(endMonth.getFullYear()).toBeGreaterThanOrEqual(now.getFullYear() + 3)
  })

  test("the single-mode picker's Calendar does not receive showOutsideDays (keeps the wrapper default)", () => {
    const el = renderCalendar(
      <BroadcastsCalendar
        broadcasts={[]}
        date="2026-08-01"
        endDate="2026-08-01"
        range="month"
      />,
    )
    const trigger = el.querySelector(
      '[aria-label="broadcasts.calendar.jumpToDate"]',
    ) as HTMLButtonElement
    act(() => {
      trigger.click()
    })

    const calendar = el.querySelector(
      '[data-testid="jump-calendar"]',
    ) as HTMLElement
    expect(calendar.hasAttribute("data-show-outside-days")).toBe(false)
  })
})

describe("BroadcastsCalendar range toggle", () => {
  test("renders 4 range options and writes setQuery({ range, endDate: null }) for a non-custom target", () => {
    const el = renderCalendar(
      <BroadcastsCalendar
        broadcasts={[]}
        date="2026-08-01"
        endDate="2026-08-01"
        range="month"
      />,
    )
    const toggleGroup = el.querySelector(
      '[data-testid="toggle-group"]',
    ) as HTMLElement
    const options = toggleGroup.querySelectorAll("button")
    expect(options.length).toBe(4)
    expect(
      Array.from(options).map((o) => o.getAttribute("data-value")),
    ).toEqual(["month", "week", "day", "custom"])

    const weekOption = Array.from(options).find(
      (o) => o.getAttribute("data-value") === "week",
    ) as HTMLButtonElement
    act(() => {
      weekOption.click()
    })
    expect(setQuery).toHaveBeenCalledWith({ range: "week", endDate: null })
  })

  test("clicking Custom from another range only opens the popover — no setQuery at all", () => {
    const el = renderCalendar(
      <BroadcastsCalendar
        broadcasts={[]}
        date="2026-08-01"
        endDate="2026-08-01"
        range="month"
      />,
    )
    const customOption = el.querySelector(
      '[data-value="custom"]',
    ) as HTMLButtonElement
    act(() => {
      customOption.click()
    })
    expect(setQuery).not.toHaveBeenCalled()

    const popoverContent = el.querySelector('[data-testid="popover-content"]')
    expect(popoverContent).not.toBeNull()
    const calendar = popoverContent?.querySelector(
      '[data-testid="jump-calendar"]',
    )
    expect(calendar?.getAttribute("data-mode")).toBe("range")
  })

  test("Apply, opened from a non-custom range, writes exactly one setQuery with { range: 'custom', date, endDate }", () => {
    const el = renderCalendar(
      <BroadcastsCalendar
        broadcasts={[]}
        date="2026-08-01"
        endDate="2026-08-01"
        range="month"
      />,
    )
    const customOption = el.querySelector(
      '[data-value="custom"]',
    ) as HTMLButtonElement
    act(() => {
      customOption.click()
    })
    expect(setQuery).not.toHaveBeenCalled()

    const jumpDay = el.querySelector(
      '[data-testid="jump-day"]',
    ) as HTMLButtonElement
    act(() => {
      jumpDay.click() // partial
    })
    act(() => {
      jumpDay.click() // complete
    })
    expect(setQuery).not.toHaveBeenCalled()

    act(() => {
      findApplyButton(el).click()
    })
    expect(setQuery).toHaveBeenCalledTimes(1)
    expect(setQuery).toHaveBeenCalledWith({
      range: "custom",
      date: "2027-01-10",
      endDate: "2027-01-15",
    })
    expect(el.querySelector('[data-testid="popover-content"]')).toBeNull()
  })

  test("dismissing the Custom popover without Apply writes nothing — the current range stays untouched", () => {
    const el = renderCalendar(
      <BroadcastsCalendar
        broadcasts={[]}
        date="2026-08-01"
        endDate="2026-08-01"
        range="month"
      />,
    )
    const customOption = el.querySelector(
      '[data-value="custom"]',
    ) as HTMLButtonElement
    act(() => {
      customOption.click()
    })

    const jumpDay = el.querySelector(
      '[data-testid="jump-day"]',
    ) as HTMLButtonElement
    act(() => {
      jumpDay.click() // partial pending range, never applied
    })

    const dismiss = el.querySelector(
      '[data-testid="popover-dismiss"]',
    ) as HTMLButtonElement
    act(() => {
      dismiss.click()
    })

    expect(setQuery).not.toHaveBeenCalled()
    expect(el.querySelector('[data-testid="popover-content"]')).toBeNull()
  })

  test("clicking Custom while already in custom mode reopens the picker without another range write", () => {
    const el = renderCalendar(
      <BroadcastsCalendar
        broadcasts={[]}
        date="2026-08-31"
        endDate="2026-09-06"
        range="custom"
      />,
    )
    const customOption = el.querySelector(
      '[data-value="custom"]',
    ) as HTMLButtonElement
    act(() => {
      customOption.click()
    })

    expect(setQuery).not.toHaveBeenCalled()
    const popoverContent = el.querySelector('[data-testid="popover-content"]')
    expect(popoverContent).not.toBeNull()
    const calendar = popoverContent?.querySelector(
      '[data-testid="jump-calendar"]',
    )
    expect(calendar?.getAttribute("data-mode")).toBe("range")

    // The Custom-toggle-anchored popover shares the same picker, so it also
    // gets the Apply footer — disabled here since nothing new was picked.
    expect(findApplyButton(el).disabled).toBe(true)
  })

  test("switching custom to week also clears endDate", () => {
    const el = renderCalendar(
      <BroadcastsCalendar
        broadcasts={[]}
        date="2026-08-31"
        endDate="2026-09-06"
        range="custom"
      />,
    )
    const weekOption = el.querySelector(
      '[data-value="week"]',
    ) as HTMLButtonElement
    act(() => {
      weekOption.click()
    })
    expect(setQuery).toHaveBeenCalledWith({ range: "week", endDate: null })
  })
})

describe("BroadcastsCalendar custom range", () => {
  test("previous/next shift both date and endDate by the span length", () => {
    const el = renderCalendar(
      <BroadcastsCalendar
        broadcasts={[]}
        date="2026-08-31"
        endDate="2026-09-06" // 7-day span
        range="custom"
      />,
    )

    const next = el.querySelector(
      '[aria-label="broadcasts.calendar.next"]',
    ) as HTMLButtonElement
    act(() => {
      next.click()
    })
    expect(setQuery).toHaveBeenCalledWith({
      date: "2026-09-07",
      endDate: "2026-09-13",
    })

    const previous = el.querySelector(
      '[aria-label="broadcasts.calendar.previous"]',
    ) as HTMLButtonElement
    act(() => {
      previous.click()
    })
    expect(setQuery).toHaveBeenCalledWith({
      date: "2026-08-24",
      endDate: "2026-08-30",
    })
  })

  test("today resets both date and endDate to null", () => {
    const el = renderCalendar(
      <BroadcastsCalendar
        broadcasts={[]}
        date="2026-08-31"
        endDate="2026-09-06"
        range="custom"
      />,
    )
    const today = Array.from(el.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "broadcasts.calendar.today",
    ) as HTMLButtonElement
    act(() => {
      today.click()
    })
    expect(setQuery).toHaveBeenCalledWith({ date: null, endDate: null })
  })

  test("lists day sections sorted, skipping days without rows", () => {
    const rows = [
      makeRow("c-2", "scheduled", new Date("2026-09-06T14:00:00Z"), "Later"),
      makeRow("c-1", "scheduled", new Date("2026-08-31T09:00:00Z"), "Earlier"),
    ]
    const el = renderCalendar(
      <BroadcastsCalendar
        broadcasts={rows}
        date="2026-08-31"
        endDate="2026-09-06"
        range="custom"
      />,
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
    expect(detailAfter?.getAttribute("data-id")).toBe("c-1")
  })

  test("shows the empty-range message when there are no broadcasts in the span", () => {
    const el = renderCalendar(
      <BroadcastsCalendar
        broadcasts={[]}
        date="2026-08-31"
        endDate="2026-09-06"
        range="custom"
      />,
    )
    expect(el.textContent).toContain("broadcasts.calendar.emptyRange")
  })

  test("the title popover's range picker only commits via Apply: click 1 (partial) keeps Apply disabled and writes nothing; click 2 (complete) enables Apply but still writes nothing; clicking Apply writes both params and closes", () => {
    const el = renderCalendar(
      <BroadcastsCalendar
        broadcasts={[]}
        date="2026-08-31"
        endDate="2026-09-06"
        range="custom"
      />,
    )

    const trigger = el.querySelector(
      '[aria-label="broadcasts.calendar.jumpToDate"]',
    ) as HTMLButtonElement
    act(() => {
      trigger.click()
    })

    const calendar = el.querySelector(
      '[data-testid="jump-calendar"]',
    ) as HTMLElement
    expect(calendar.getAttribute("data-mode")).toBe("range")
    expect(findApplyButton(el).disabled).toBe(true)

    const jumpDay = el.querySelector(
      '[data-testid="jump-day"]',
    ) as HTMLButtonElement

    // First click: the picker's `selected` prop starts as the complete
    // {anchor, endAnchor} range, so — matching real react-day-picker 9.14's
    // resetOnSelect semantics — this click starts a fresh, partial range.
    act(() => {
      jumpDay.click()
    })
    expect(setQuery).not.toHaveBeenCalled()
    expect(el.querySelector('[data-testid="popover-content"]')).not.toBeNull()
    expect(findApplyButton(el).disabled).toBe(true)

    // Second click: the picker now receives the partial pending range as
    // `selected`, so this click completes it — but completing a range no
    // longer auto-commits; only Apply does.
    act(() => {
      jumpDay.click()
    })
    expect(setQuery).not.toHaveBeenCalled()
    expect(el.querySelector('[data-testid="popover-content"]')).not.toBeNull()
    expect(findApplyButton(el).disabled).toBe(false)

    act(() => {
      findApplyButton(el).click()
    })
    expect(setQuery).toHaveBeenCalledWith({
      range: "custom",
      date: "2027-01-10",
      endDate: "2027-01-15",
    })
    expect(el.querySelector('[data-testid="popover-content"]')).toBeNull()
  })

  test("Apply is disabled on a fresh open with nothing picked yet", () => {
    const el = renderCalendar(
      <BroadcastsCalendar
        broadcasts={[]}
        date="2026-08-31"
        endDate="2026-09-06"
        range="custom"
      />,
    )
    const trigger = el.querySelector(
      '[aria-label="broadcasts.calendar.jumpToDate"]',
    ) as HTMLButtonElement
    act(() => {
      trigger.click()
    })
    expect(findApplyButton(el).disabled).toBe(true)
  })

  test("closing the popover without Apply discards the pending selection; reopening shows the anchor/endAnchor selection again", () => {
    const el = renderCalendar(
      <BroadcastsCalendar
        broadcasts={[]}
        date="2026-08-31"
        endDate="2026-09-06"
        range="custom"
      />,
    )
    const trigger = el.querySelector(
      '[aria-label="broadcasts.calendar.jumpToDate"]',
    ) as HTMLButtonElement
    act(() => {
      trigger.click()
    })

    const jumpDay = el.querySelector(
      '[data-testid="jump-day"]',
    ) as HTMLButtonElement
    act(() => {
      jumpDay.click() // partial pending range, never applied
    })
    expect(findApplyButton(el).disabled).toBe(true)

    const dismiss = el.querySelector(
      '[data-testid="popover-dismiss"]',
    ) as HTMLButtonElement
    act(() => {
      dismiss.click()
    })
    expect(setQuery).not.toHaveBeenCalled()
    expect(el.querySelector('[data-testid="popover-content"]')).toBeNull()

    act(() => {
      trigger.click()
    })
    const calendar = el.querySelector(
      '[data-testid="jump-calendar"]',
    ) as HTMLElement
    expect(calendar.getAttribute("data-selected")).toBe(
      JSON.stringify({ from: "2026-08-31", to: "2026-09-06" }),
    )
  })

  test("an end date beyond the 92-day cap is clamped in the written endDate, via Apply", () => {
    const el = renderCalendar(
      <BroadcastsCalendar
        broadcasts={[]}
        date="2026-08-31"
        endDate="2026-09-06"
        range="custom"
      />,
    )

    const trigger = el.querySelector(
      '[aria-label="broadcasts.calendar.jumpToDate"]',
    ) as HTMLButtonElement
    act(() => {
      trigger.click()
    })

    const jumpFarFuture = el.querySelector(
      '[data-testid="jump-day-far-future"]',
    ) as HTMLButtonElement
    act(() => {
      jumpFarFuture.click()
    })
    expect(setQuery).not.toHaveBeenCalled()
    expect(findApplyButton(el).disabled).toBe(false)

    act(() => {
      findApplyButton(el).click()
    })

    const expectedClampedEndDate = format(
      addDays(RANGE_PICK_FROM, MAX_CUSTOM_RANGE_DAYS - 1),
      "yyyy-MM-dd",
    )
    expect(setQuery).toHaveBeenCalledWith({
      range: "custom",
      date: "2027-01-10",
      endDate: expectedClampedEndDate,
    })
    expect(el.querySelector('[data-testid="popover-content"]')).toBeNull()
  })

  test("the range picker passes width/wrap-fix classNames to the Calendar", () => {
    const el = renderCalendar(
      <BroadcastsCalendar
        broadcasts={[]}
        date="2026-08-31"
        endDate="2026-09-06"
        range="custom"
      />,
    )
    const trigger = el.querySelector(
      '[aria-label="broadcasts.calendar.jumpToDate"]',
    ) as HTMLButtonElement
    act(() => {
      trigger.click()
    })

    const calendar = el.querySelector(
      '[data-testid="jump-calendar"]',
    ) as HTMLElement
    const classNamesAttr = calendar.getAttribute("data-class-names")
    expect(classNamesAttr).toBeTruthy()
    const classNames = JSON.parse(classNamesAttr as string)
    expect(classNames.month).toContain("min-w-64")
    expect(classNames.dropdown_root).toContain("whitespace-nowrap")
  })

  test("the range picker's Calendar receives showOutsideDays={false}", () => {
    const el = renderCalendar(
      <BroadcastsCalendar
        broadcasts={[]}
        date="2026-08-31"
        endDate="2026-09-06"
        range="custom"
      />,
    )
    const trigger = el.querySelector(
      '[aria-label="broadcasts.calendar.jumpToDate"]',
    ) as HTMLButtonElement
    act(() => {
      trigger.click()
    })

    const calendar = el.querySelector(
      '[data-testid="jump-calendar"]',
    ) as HTMLElement
    expect(calendar.getAttribute("data-show-outside-days")).toBe("false")
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
        endDate="2026-09-02"
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
      <BroadcastsCalendar
        broadcasts={[]}
        date="2026-09-02"
        endDate="2026-09-02"
        range="week"
      />,
    )

    const next = el.querySelector(
      '[aria-label="broadcasts.calendar.next"]',
    ) as HTMLButtonElement
    act(() => {
      next.click()
    })
    expect(setQuery).toHaveBeenCalledWith({
      date: "2026-09-09",
      endDate: null,
    })

    const previous = el.querySelector(
      '[aria-label="broadcasts.calendar.previous"]',
    ) as HTMLButtonElement
    act(() => {
      previous.click()
    })
    expect(setQuery).toHaveBeenCalledWith({
      date: "2026-08-26",
      endDate: null,
    })

    const today = Array.from(el.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "broadcasts.calendar.today",
    ) as HTMLButtonElement
    act(() => {
      today.click()
    })
    expect(setQuery).toHaveBeenCalledWith({ date: null, endDate: null })
  })
})

describe("BroadcastsCalendar day view", () => {
  test("lists rows sorted by time and opens the dialog on click", () => {
    const rows = [
      makeRow("d-2", "scheduled", new Date("2026-09-02T14:00:00Z"), "Later"),
      makeRow("d-1", "scheduled", new Date("2026-09-02T09:00:00Z"), "Earlier"),
    ]
    const el = renderCalendar(
      <BroadcastsCalendar
        broadcasts={rows}
        date="2026-09-02"
        endDate="2026-09-02"
        range="day"
      />,
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
      <BroadcastsCalendar
        broadcasts={[]}
        date="2026-09-02"
        endDate="2026-09-02"
        range="day"
      />,
    )
    expect(el.textContent).toContain("broadcasts.calendar.emptyDay")
  })
})
