// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { CreateAppointmentDialogTrigger } from "../create-appointment-trigger"

const mocks = vi.hoisted(() => ({
  executeAsync: vi.fn(),
  disableBot: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  updateConversation: vi.fn(),
  isExecuting: false,
  actionCount: 0,
  conversation: {
    id: "conv-1",
    workspaceId: "ws-1",
    botEnabled: true,
    botResumeAt: null as Date | null,
  },
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}))

vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: (selector: (state: unknown) => unknown) =>
    selector({
      activeConversationId: mocks.conversation.id,
      conversations: [mocks.conversation],
      updateConversation: mocks.updateConversation,
    }),
}))

// `useAction` is called twice per render: first the bot-pause, then the link.
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => {
    mocks.actionCount += 1
    return mocks.actionCount % 2 === 1
      ? { execute: mocks.disableBot }
      : { executeAsync: mocks.executeAsync, isExecuting: mocks.isExecuting }
  },
}))

vi.mock("@/features/conversations/actions/disable-bot.action", () => ({
  disableBotAction: { bind: () => ({}) },
}))
vi.mock(
  "@/features/appointment-management/actions/create-inbox-booking-link.action",
  () => ({ createInboxBookingLinkAction: { bind: () => ({}) } }),
)

vi.mock("@chatbotx.io/ui/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock(
  "@/features/appointment-calendars/components/appointment-calendar-select",
  () => ({
    AppointmentCalendarSelect: (props: {
      onValueChange: (id: string | null) => void
    }) => (
      <button
        data-testid="pick-calendar"
        onClick={() => props.onValueChange("cal-1")}
        type="button"
      />
    ),
  }),
)

let container: HTMLDivElement
let root: Root
let fakeWindow: { close: ReturnType<typeof vi.fn>; location: { href: string } }
let openSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  mocks.actionCount = 0
  mocks.isExecuting = false
  mocks.conversation.botEnabled = true
  mocks.executeAsync.mockResolvedValue({
    data: { url: "https://app.test/booking/picker?token=t", messageId: "m-1" },
  })
  fakeWindow = { close: vi.fn(), location: { href: "about:blank" } }
  openSpy = vi
    .spyOn(window, "open")
    .mockImplementation(() => fakeWindow as unknown as Window)
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  openSpy.mockRestore()
})

const render = () =>
  act(() =>
    root.render(
      <CreateAppointmentDialogTrigger
        bypassThreadControlLock={true}
        inboxId="inbox-7"
      />,
    ),
  )
const byLabel = (label: string) =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
const buttonWithText = (text: string) =>
  Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
    (b) => b.textContent?.includes(text),
  )
const click = async (element: HTMLElement | null | undefined) => {
  await act(async () => {
    element?.click()
    await Promise.resolve()
  })
}
const openDialog = () => click(byLabel("inbox.createAppointment.title"))
const pickCalendar = () =>
  click(container.querySelector<HTMLElement>('[data-testid="pick-calendar"]'))

describe("CreateAppointmentDialogTrigger", () => {
  test("keeps both actions disabled until a calendar is chosen", async () => {
    render()
    await openDialog()

    expect(buttonWithText("inbox.createAppointment.sendLink")?.disabled).toBe(
      true,
    )
    expect(buttonWithText("inbox.createAppointment.goToLink")?.disabled).toBe(
      true,
    )

    await pickCalendar()

    expect(buttonWithText("inbox.createAppointment.sendLink")?.disabled).toBe(
      false,
    )
  })

  test("sends the link on the composer's inbox and pauses the bot", async () => {
    render()
    await openDialog()
    await pickCalendar()
    await click(buttonWithText("inbox.createAppointment.sendLink"))

    expect(mocks.executeAsync).toHaveBeenCalledWith({
      calendarId: "cal-1",
      inboxId: "inbox-7",
      send: true,
      bypassThreadControlLock: true,
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "inbox.createAppointment.sent",
    )
    expect(mocks.disableBot).toHaveBeenCalledWith({ ids: ["conv-1"] })
    expect(container.querySelector('[data-testid="dialog"]')).toBeNull()
  })

  test("opens the window before awaiting, then points it at the link", async () => {
    let resolveAction: (value: unknown) => void = () => undefined
    mocks.executeAsync.mockReturnValue(
      new Promise((resolve) => {
        resolveAction = resolve
      }),
    )
    render()
    await openDialog()
    await pickCalendar()
    await click(buttonWithText("inbox.createAppointment.goToLink"))

    expect(openSpy).toHaveBeenCalledWith("about:blank", "_blank")
    expect(mocks.executeAsync).toHaveBeenCalledWith({
      calendarId: "cal-1",
      inboxId: "inbox-7",
      send: false,
    })

    await act(async () => {
      resolveAction({
        data: { url: "https://app.test/booking/picker?token=t" },
      })
      await Promise.resolve()
    })

    expect(fakeWindow.location.href).toBe(
      "https://app.test/booking/picker?token=t",
    )
    expect(fakeWindow.close).not.toHaveBeenCalled()
  })

  test("closes the opened window when the link cannot be created", async () => {
    mocks.executeAsync.mockResolvedValue({ serverError: "Calendar inactive" })
    render()
    await openDialog()
    await pickCalendar()
    await click(buttonWithText("inbox.createAppointment.goToLink"))

    expect(fakeWindow.close).toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith(
      "inbox.createAppointment.failed",
      { description: "Calendar inactive" },
    )
  })
})
