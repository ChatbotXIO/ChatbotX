// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { CreateContactAppointmentDialog } from "../create-contact-appointment-dialog"

type ActionCallbacks = {
  onSuccess?: (args: { data: Record<string, unknown> }) => Promise<void> | void
}

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  invalidate: vi.fn(),
  refetch: vi.fn(),
  toastSuccess: vi.fn(),
  callbacks: null as ActionCallbacks | null,
  availability: {
    data: undefined as
      | undefined
      | {
          timezone: string
          slots: { startAt: Date; endAt: Date }[]
        },
    isPending: false,
    isError: false,
  },
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn() },
}))
vi.mock("next-safe-action/hooks", () => ({
  useAction: (_action: unknown, callbacks: ActionCallbacks) => {
    mocks.callbacks = callbacks
    return { execute: mocks.execute, isPending: false }
  },
}))
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ ...mocks.availability, refetch: mocks.refetch }),
}))
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    appointmentCalendarsAPI: {
      getContactAvailabilityAPI: { queryOptions: () => ({}) },
    },
  },
}))
vi.mock("../../../actions/book-contact-appointment.action", () => ({
  bookContactAppointmentAction: { bind: () => ({}) },
}))
vi.mock("../../../lib/use-invalidate-appointments", () => ({
  useInvalidateAppointments: () => mocks.invalidate,
}))
vi.mock("@chatbotx.io/ui/components/ui/dialog", () => {
  const Pass = ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )
  return {
    Dialog: ({
      open,
      children,
    }: {
      open: boolean
      children: React.ReactNode
    }) => (open ? <div data-testid="dialog">{children}</div> : null),
    DialogContent: Pass,
    DialogHeader: Pass,
    DialogTitle: Pass,
    DialogDescription: Pass,
    DialogFooter: Pass,
  }
})
vi.mock(
  "@/features/appointment-calendars/components/appointment-calendar-select",
  () => ({
    AppointmentCalendarSelect: (props: {
      onValueChange: (id: string) => void
    }) => (
      <button
        data-testid="pick-calendar"
        onClick={() => props.onValueChange("cal-1")}
        type="button"
      />
    ),
  }),
)
vi.mock("@/features/booking-webview/components/slot-picker", () => ({
  SlotTimezoneSelect: () => null,
  SlotPicker: (props: { onSelectSlot: (startAt: string | null) => void }) => (
    <button
      data-testid="pick-slot"
      onClick={() => props.onSelectSlot("2026-11-10T09:00:00.000Z")}
      type="button"
    />
  ),
}))

let container: HTMLDivElement
let root: Root
const onOpenChange = vi.fn()

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  mocks.availability = {
    data: {
      timezone: "Asia/Ho_Chi_Minh",
      slots: [
        {
          startAt: new Date("2026-11-10T09:00:00.000Z"),
          endAt: new Date("2026-11-10T09:30:00.000Z"),
        },
      ],
    },
    isPending: false,
    isError: false,
  }
  mocks.invalidate.mockResolvedValue(undefined)
  mocks.refetch.mockResolvedValue(undefined)
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = (props: { conversationId?: string } = {}) =>
  act(() =>
    root.render(
      <CreateContactAppointmentDialog
        contactId="contact-1"
        onOpenChange={onOpenChange}
        open
        workspaceId="ws-1"
        {...props}
      />,
    ),
  )
const submitButton = () =>
  Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("appointments.actions.create"),
  )
const click = (testId: string) =>
  act(() =>
    container.querySelector<HTMLElement>(`[data-testid="${testId}"]`)?.click(),
  )

describe("CreateContactAppointmentDialog", () => {
  test("keeps submit disabled until a slot is chosen", () => {
    render({ conversationId: "conv-1" })

    expect(submitButton()?.disabled).toBe(true)
    click("pick-calendar")
    expect(submitButton()?.disabled).toBe(true)
    click("pick-slot")
    expect(submitButton()?.disabled).toBe(false)
  })

  test("books in the calendar timezone for the open conversation", () => {
    render({ conversationId: "conv-1" })
    click("pick-calendar")
    click("pick-slot")
    act(() => submitButton()?.click())

    expect(mocks.execute).toHaveBeenCalledWith({
      calendarId: "cal-1",
      contactId: "contact-1",
      conversationId: "conv-1",
      startAt: "2026-11-10T09:00:00.000Z",
      inviteeTimezone: "Asia/Ho_Chi_Minh",
    })
    expect(container.textContent).not.toContain(
      "appointments.create.noConversationHint",
    )
  })

  test("warns that the contact gets no confirmation without a conversation", () => {
    render()

    expect(container.textContent).toContain(
      "appointments.create.noConversationHint",
    )
  })

  test("invalidates and closes after a completed booking", async () => {
    render({ conversationId: "conv-1" })

    await act(async () => {
      await mocks.callbacks?.onSuccess?.({ data: { completed: true } })
    })

    expect(mocks.invalidate).toHaveBeenCalled()
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "appointments.create.success",
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test("refetches and stays open when the slot was taken", async () => {
    render({ conversationId: "conv-1" })
    click("pick-calendar")
    click("pick-slot")

    await act(async () => {
      await mocks.callbacks?.onSuccess?.({
        data: { completed: false, staleSlot: true },
      })
    })

    expect(mocks.refetch).toHaveBeenCalled()
    expect(mocks.invalidate).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(container.textContent).toContain("bookingWebview.errors.staleSlot")
    expect(submitButton()?.disabled).toBe(true)
  })

  test("explains an already-scheduled contact without refetching the slots", async () => {
    render({ conversationId: "conv-1" })
    click("pick-calendar")
    click("pick-slot")

    await act(async () => {
      await mocks.callbacks?.onSuccess?.({
        data: { completed: false, alreadyScheduled: true },
      })
    })

    expect(mocks.refetch).not.toHaveBeenCalled()
    expect(mocks.invalidate).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(container.textContent).toContain(
      "bookingWebview.errors.alreadyScheduled",
    )
    expect(container.textContent).not.toContain(
      "bookingWebview.errors.staleSlot",
    )
  })
})
