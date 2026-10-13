import {
  type RecurrenceRule,
  recurrenceRuleSchema,
} from "@chatbotx.io/utils/recurrence"
import { zodResolver } from "@hookform/resolvers/zod"
import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { z } from "zod"
import messages from "../messages/en.json"
import { RecurrenceRuleFields } from "../src/components/recurrence/recurrence-rule-fields"

// jsdom ships no PointerEvent constructor; base-ui's controls re-dispatch one.
if (typeof globalThis.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    constructor(type: string, params: MouseEventInit = {}) {
      super(type, params)
    }
  }
  Object.assign(globalThis, { PointerEvent: PointerEventPolyfill })
}

// 2026-10-15 is a Thursday.
const NOW = new Date("2026-10-15T09:00:00Z")

const WEEKLY: RecurrenceRule = {
  frequency: "weekly",
  interval: 1,
  weekdays: [4],
  timeOfDay: "09:30",
  timezone: "UTC",
  startsOn: "2026-10-15",
  end: { kind: "never" },
}

const formSchema = z.object({ recurrence: recurrenceRuleSchema })
type FormValues = z.infer<typeof formSchema>

let latest: RecurrenceRule | undefined
let validate: (() => Promise<boolean>) | undefined

function Harness({
  rule,
  occurrenceCount,
}: {
  rule: RecurrenceRule
  occurrenceCount?: number
}) {
  const form = useForm<FormValues>({
    defaultValues: { recurrence: rule },
    mode: "onChange",
    resolver: zodResolver(formSchema),
  })
  latest = form.watch("recurrence")
  validate = () => form.trigger()
  return (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <FormProvider {...form}>
        <RecurrenceRuleFields occurrenceCount={occurrenceCount} />
      </FormProvider>
    </NextIntlClientProvider>
  )
}

describe("RecurrenceRuleFields", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    latest = undefined
    validate = undefined
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.useRealTimers()
  })

  const render = (rule: RecurrenceRule, occurrenceCount?: number) => {
    act(() => {
      // A new key remounts the form: `useForm` only reads `defaultValues` once.
      root.render(
        <Harness
          key={JSON.stringify(rule)}
          occurrenceCount={occurrenceCount}
          rule={rule}
        />,
      )
    })
  }
  const weekdayButton = (name: string) =>
    container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)
  const text = () => container.textContent ?? ""

  test("describes a weekly rule in words and lists the next runs", () => {
    render(WEEKLY)

    expect(text()).toContain("Every week on Thursday at 09:30 (UTC)")
    // A calendar date is the same date whatever zone the browser is in.
    expect(text()).toContain("starting Oct 15, 2026")
    expect(text()).toContain("Next runs")
    // The rule starts today at 09:30, after the frozen 09:00 clock.
    expect(text()).toContain("Thu, Oct 15, 2026")
    expect(text()).toContain("Thu, Oct 22, 2026")
  })

  test("shows the weekday chips only for a weekly rule", () => {
    render(WEEKLY)
    expect(weekdayButton("Thursday")?.getAttribute("aria-pressed")).toBe("true")
    expect(weekdayButton("Friday")?.getAttribute("aria-pressed")).toBe("false")

    render({ ...WEEKLY, frequency: "daily", weekdays: undefined })
    expect(weekdayButton("Thursday")).toBeNull()
    expect(text()).toContain("Every day at 09:30")
  })

  test("toggling a weekday updates the rule", () => {
    render(WEEKLY)
    act(() => {
      weekdayButton("Monday")?.click()
    })
    expect(latest?.weekdays).toEqual([1, 4])

    act(() => {
      weekdayButton("Thursday")?.click()
    })
    expect(latest?.weekdays).toEqual([1])
  })

  test("deselecting every weekday is rejected by the rule", async () => {
    render(WEEKLY)
    act(() => {
      weekdayButton("Thursday")?.click()
    })

    let valid = true
    await act(async () => {
      valid = (await validate?.()) ?? true
    })
    expect(valid).toBe(false)
  })

  test("a monthly rule shows the day of the month and warns about short months", () => {
    render({
      ...WEEKLY,
      frequency: "monthly",
      weekdays: undefined,
      monthDay: 31,
    })

    expect(weekdayButton("Thursday")).toBeNull()
    expect(text()).toContain("Day of the month")
    expect(text()).toContain("In shorter months this runs on the last day.")
    expect(text()).toContain("on day 31")
  })

  test("a monthly rule on an early day carries no short-month warning", () => {
    render({
      ...WEEKLY,
      frequency: "monthly",
      weekdays: undefined,
      monthDay: 5,
    })

    expect(text()).not.toContain("In shorter months")
  })

  test("pluralizes the interval", () => {
    render({ ...WEEKLY, interval: 3 })
    expect(text()).toContain("Every 3 weeks on Thursday")
  })

  test("says when the rule ends", () => {
    render({ ...WEEKLY, end: { kind: "afterOccurrences", count: 10 } })
    expect(text()).toContain("ending after 10 occurrences")

    render({ ...WEEKLY, end: { kind: "onDate", date: "2026-12-31" } })
    expect(text()).toContain("ending Dec 31, 2026")
  })

  test("warns when today's time has already passed", () => {
    render({ ...WEEKLY, timeOfDay: "08:00" })

    expect(text()).toContain("The first run is")
    expect(text()).toContain("because today's time has already passed")
  })

  test("an end date before the start is reported under the end field", async () => {
    render({ ...WEEKLY, end: { kind: "onDate", date: "2026-10-01" } })

    await act(async () => {
      await validate?.()
    })
    expect(
      container.querySelector('[role="alert"]')?.textContent?.length,
    ).toBeGreaterThan(0)
  })

  test("a rule with no runs left says so instead of listing times", () => {
    render({
      ...WEEKLY,
      end: { kind: "onDate", date: "2026-10-15" },
      timeOfDay: "08:00",
    })

    expect(text()).toContain("No upcoming runs.")
  })

  test("the start date button shows the stored calendar date", () => {
    render(WEEKLY)

    const startsOn = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Starts on"]',
    )
    expect(startsOn?.textContent).toContain("Oct 15, 2026")
  })

  test("keeps a zone the picker list does not name selectable", () => {
    // Browsers still report some zones under an older alias.
    render({ ...WEEKLY, timezone: "Asia/Saigon" })

    expect(text()).toContain("Asia/Saigon")
    expect(text()).not.toContain("Please select")
  })

  test("the preview counts from the runs a series already made", () => {
    // 9 of 10 runs are done: only one more is left to promise.
    render({ ...WEEKLY, end: { kind: "afterOccurrences", count: 10 } }, 9)

    expect(text()).toContain("Thu, Oct 15, 2026")
    expect(text()).not.toContain("Thu, Oct 22, 2026")
  })

  test("a series that already ran has no first-run warning", () => {
    render({ ...WEEKLY, timeOfDay: "08:00" }, 3)

    expect(text()).not.toContain("The first run is")
  })

  test("the date buttons announce their date", () => {
    render(WEEKLY)

    expect(
      container.querySelector('button[aria-label="Starts on: Oct 15, 2026"]'),
    ).not.toBeNull()
  })

  test("the interval and unit are one named group", () => {
    render(WEEKLY)

    expect(
      container.querySelector('fieldset[aria-label="Repeat every"]'),
    ).not.toBeNull()
  })
  describe("skip dates", () => {
    const withSkips = (...excludeDates: string[]): RecurrenceRule => ({
      ...WEEKLY,
      excludeDates,
    })
    const chipRemovers = () =>
      Array.from(
        container.querySelectorAll<HTMLButtonElement>(
          "button[aria-label^='Remove ']",
        ),
      ).map((button) => button.getAttribute("aria-label"))
    const click = (button: Element | null | undefined) => {
      act(() => {
        button?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      })
    }
    const buttonNamed = (name: string) =>
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === name,
      )

    test("offers to add dates and shows none until one is picked", () => {
      render(WEEKLY)
      expect(text()).toContain("Skip dates")
      expect(text()).toContain("These dates won't send")
      expect(buttonNamed("Add dates")).toBeDefined()
      expect(chipRemovers()).toEqual([])
    })

    test("shows every skipped date as a removable chip", () => {
      render(withSkips("2026-12-24", "2026-12-31"))
      expect(chipRemovers()).toEqual([
        "Remove Dec 24, 2026",
        "Remove Dec 31, 2026",
      ])
      expect(text()).toContain("Skipping Dec 24, 2026 and Dec 31, 2026")
    })

    test("removing a chip drops only that date", () => {
      render(withSkips("2026-12-24", "2026-12-31"))
      click(container.querySelector("button[aria-label='Remove Dec 24, 2026']"))
      expect(latest?.excludeDates).toEqual(["2026-12-31"])
    })

    test("clear all empties the list", () => {
      render(withSkips("2026-12-24", "2026-12-31"))
      click(buttonNamed("Clear all"))
      expect(latest?.excludeDates).toEqual([])
      expect(chipRemovers()).toEqual([])
    })

    test("collapses a long list behind a Show more button", () => {
      const many = Array.from(
        { length: 10 },
        (_, index) => `2026-12-${10 + index}`,
      )
      render(withSkips(...many))
      expect(chipRemovers()).toHaveLength(8)
      click(buttonNamed("Show 2 more"))
      expect(chipRemovers()).toHaveLength(10)
      click(buttonNamed("Show less"))
      expect(chipRemovers()).toHaveLength(8)
    })

    test("a rule that is not valid yet cannot pick dates", () => {
      render({ ...WEEKLY, weekdays: [] })
      expect(buttonNamed("Add dates")?.disabled).toBe(true)
    })
  })
})
