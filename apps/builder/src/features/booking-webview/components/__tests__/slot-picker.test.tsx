// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { SlotPicker } from "../slot-picker"

type CalendarProps = {
  disabled: (date: Date) => boolean
  onSelect: (date: Date | undefined) => void
  selected?: Date
}

const calendar = vi.hoisted(() => ({ props: null as CalendarProps | null }))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("@chatbotx.io/ui/components/ui/calendar", () => ({
  Calendar: (props: CalendarProps) => {
    calendar.props = props
    return <div data-testid="calendar" />
  },
}))

const slots = [
  { startAt: "2026-11-10T09:00:00.000Z", endAt: "2026-11-10T09:30:00.000Z" },
  { startAt: "2026-11-10T10:00:00.000Z", endAt: "2026-11-10T10:30:00.000Z" },
  { startAt: "2026-11-12T09:00:00.000Z", endAt: "2026-11-12T09:30:00.000Z" },
]

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  calendar.props = null
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = (
  props: Partial<Parameters<typeof SlotPicker>[0]> & {
    onSelectSlot: (startAt: string | null) => void
  },
) =>
  act(() =>
    root.render(
      <SlotPicker
        selectedSlot={null}
        selectedTimezone="UTC"
        slots={slots}
        timezone="UTC"
        {...props}
      />,
    ),
  )
const timeButtons = () => Array.from(container.querySelectorAll("button"))

describe("SlotPicker", () => {
  test("shows the first day's times and disables days without slots", () => {
    render({ onSelectSlot: vi.fn() })

    expect(timeButtons()).toHaveLength(2)
    expect(calendar.props?.disabled(new Date(2026, 10, 11, 12))).toBe(true)
    expect(calendar.props?.disabled(new Date(2026, 10, 12, 12))).toBe(false)
  })

  test("reports a chosen time and the interaction", () => {
    const onSelectSlot = vi.fn()
    const onInteract = vi.fn()
    render({ onSelectSlot, onInteract })

    act(() => timeButtons()[1]?.click())

    expect(onSelectSlot).toHaveBeenLastCalledWith("2026-11-10T10:00:00.000Z")
    expect(onInteract).toHaveBeenCalled()
  })

  test("clears the chosen slot when another day is picked", () => {
    const onSelectSlot = vi.fn()
    render({ onSelectSlot, selectedSlot: "2026-11-10T09:00:00.000Z" })
    onSelectSlot.mockClear()

    act(() => calendar.props?.onSelect(new Date(2026, 10, 12, 12)))

    expect(onSelectSlot).toHaveBeenCalledWith(null)
    expect(timeButtons()).toHaveLength(1)
  })

  test("falls back to the first day and clears the slot when the shown day disappears", () => {
    const onSelectSlot = vi.fn()
    render({ onSelectSlot })
    onSelectSlot.mockClear()

    render({ onSelectSlot, slots: slots.slice(2) })

    expect(onSelectSlot).toHaveBeenCalledWith(null)
    expect(timeButtons()).toHaveLength(1)
  })

  test("shows the empty state without slots", () => {
    render({ onSelectSlot: vi.fn(), slots: [] })

    expect(container.textContent).toContain("empty")
    expect(calendar.props).toBeNull()
  })
})
