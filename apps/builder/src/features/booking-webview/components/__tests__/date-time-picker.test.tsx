// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { DateTimePicker } from "../date-time-picker"

type ActionCallbacks = {
  onSuccess?: (args: { data: Record<string, unknown> }) => void
  onError?: () => void
}

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  refresh: vi.fn(),
  callbacks: null as ActionCallbacks | null,
}))

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))
vi.mock("next-safe-action/hooks", () => ({
  useAction: (_action: unknown, callbacks: ActionCallbacks) => {
    mocks.callbacks = callbacks
    return { execute: mocks.execute, isPending: false }
  },
}))
vi.mock("@/app/booking/picker/actions/submit-booking.action", () => ({
  submitBookingAction: {},
}))
vi.mock("@chatbotx.io/ui/components/ui/calendar", () => ({
  Calendar: () => <div data-testid="calendar" />,
}))

const slots = [
  { startAt: "2026-11-10T02:00:00.000Z", endAt: "2026-11-10T02:30:00.000Z" },
  { startAt: "2026-11-10T03:00:00.000Z", endAt: "2026-11-10T03:30:00.000Z" },
]

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = (props: Partial<Parameters<typeof DateTimePicker>[0]> = {}) =>
  act(() =>
    root.render(
      <DateTimePicker
        calendarName="Consultation"
        slots={slots}
        timezone="Asia/Ho_Chi_Minh"
        token="token-1"
        {...props}
      />,
    ),
  )
const buttonWithText = (text: string) =>
  Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(text),
  )
const slotButton = (startAt: string) =>
  container.querySelector<HTMLButtonElement>(
    `button[data-slot-start="${startAt}"]`,
  )

describe("DateTimePicker (public booking webview)", () => {
  test("keeps its header, timezone and slot list", () => {
    render()

    expect(container.textContent).toContain("Consultation")
    expect(container.textContent).toContain("bookingWebview.timezone")
    expect(slotButton(slots[0].startAt)).not.toBeNull()
    expect(slotButton(slots[1].startAt)).not.toBeNull()
  })

  test("books the chosen slot in the chosen timezone", () => {
    render()
    const book = buttonWithText("bookingWebview.actions.book")
    expect(book?.disabled).toBe(true)

    act(() => slotButton(slots[1].startAt)?.click())
    expect(book?.disabled).toBe(false)
    act(() => book?.click())

    expect(mocks.execute).toHaveBeenCalledWith({
      token: "token-1",
      selectedStartAt: slots[1].startAt,
      inviteeTimezone: "Asia/Ho_Chi_Minh",
    })
  })

  test("shows the stale-slot error until another slot is picked", () => {
    render()
    act(() => slotButton(slots[0].startAt)?.click())
    act(() => mocks.callbacks?.onSuccess?.({ data: { staleSlot: true } }))
    expect(container.textContent).toContain("bookingWebview.errors.staleSlot")

    act(() => slotButton(slots[1].startAt)?.click())
    expect(container.textContent).not.toContain(
      "bookingWebview.errors.staleSlot",
    )
  })

  test("clears the slot and refreshes when availability changed", () => {
    render()
    act(() => slotButton(slots[0].startAt)?.click())
    act(() =>
      mocks.callbacks?.onSuccess?.({ data: { availabilityChanged: true } }),
    )

    expect(container.textContent).toContain(
      "bookingWebview.errors.availabilityChanged",
    )
    expect(mocks.refresh).toHaveBeenCalled()
    expect(buttonWithText("bookingWebview.actions.book")?.disabled).toBe(true)
  })

  test("labels the submit Confirm for flow selectAvailability tokens", () => {
    render({ submitMode: "select" })

    expect(buttonWithText("actions.confirm")).toBeDefined()
    expect(buttonWithText("bookingWebview.actions.book")).toBeUndefined()
  })

  test("shows the details link after booking outside a Messenger webview", () => {
    render()
    act(() =>
      mocks.callbacks?.onSuccess?.({
        data: { completed: true, scheduleUrl: "https://app.test/schedule" },
      }),
    )

    expect(container.textContent).toContain("bookingWebview.success.title")
    expect(
      container.querySelector('a[href="https://app.test/schedule"]'),
    ).not.toBeNull()
  })

  test("shows the empty state without slots", () => {
    render({ slots: [] })

    expect(container.textContent).toContain("bookingWebview.empty")
  })
})
