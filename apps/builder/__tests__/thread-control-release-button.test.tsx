import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { ThreadControlView } from "@/features/conversations/utils/thread-control"
import messages from "../messages/en.json"

const threadControlState = vi.hoisted(() => ({
  view: null as ThreadControlView | null,
}))
vi.mock("@/features/conversations/hooks/use-thread-control", () => ({
  useThreadControl: () => threadControlState.view,
}))

const actionHook = vi.hoisted(() => ({
  execute: vi.fn(),
  isExecuting: false,
}))
vi.mock("@/features/conversations/hooks/use-thread-control-action", () => ({
  useThreadControlAction: () => ({
    execute: actionHook.execute,
    isExecuting: actionHook.isExecuting,
  }),
}))

// The dialog has its own tests; here it only needs to show whether it is open.
vi.mock(
  "@/features/conversations/components/thread-control-pass-partner-dialog",
  () => ({
    ThreadControlPassPartnerDialog: ({ open }: { open: boolean }) =>
      open ? <div data-testid="pass-dialog" /> : null,
  }),
)

const { ThreadControlReleaseButton } = await import(
  "@/features/conversations/components/thread-control-release-button"
)

const NOW = new Date("2026-09-29T12:00:00.000Z")

const view = (
  overrides: Partial<ThreadControlView> = {},
): ThreadControlView => ({
  contactInboxId: "ci-1",
  inboxId: "inbox-1",
  channel: "whatsapp",
  state: "owned",
  ownerRole: "customer_service",
  ownerAppId: null,
  updatedAt: NOW,
  canRelease: true,
  canPass: true,
  isLocked: false,
  inlineReplyTakesOver: false,
  idleAt: null,
  now: NOW,
  ...overrides,
})

type Conversation = Parameters<
  typeof ThreadControlReleaseButton
>[0]["conversation"]
const conversation = { id: "conv-1", workspaceId: "ws-1" } as Conversation

describe("ThreadControlReleaseButton", () => {
  let container: HTMLDivElement
  let root: Root

  const render = () =>
    act(() => {
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <ThreadControlReleaseButton conversation={conversation} />
        </NextIntlClientProvider>,
      )
    })

  const pressSequence = (element: Element | null | undefined) =>
    act(() => {
      // Base UI reacts to the pointer sequence, not to a bare click().
      for (const type of [
        "pointerdown",
        "mousedown",
        "pointerup",
        "mouseup",
        "click",
      ]) {
        element?.dispatchEvent(new MouseEvent(type, { bubbles: true }))
      }
    })

  const trigger = () =>
    container.querySelector<HTMLButtonElement>(
      'button[aria-label="Release or pass"]',
    )
  const plainRelease = () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="Release"]')
  const menuItem = (label: string) =>
    Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ).find((item) => item.textContent?.trim().startsWith(label))

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    actionHook.isExecuting = false
    threadControlState.view = view()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("renders nothing when the thread cannot be released", () => {
    threadControlState.view = view({ canRelease: false })
    render()

    expect(container.textContent).toBe("")
  })

  test("is a plain Release button when the thread cannot be passed to a partner", () => {
    threadControlState.view = view({ canPass: false })
    render()

    expect(trigger()).toBeNull()
    act(() => plainRelease()?.click())
    expect(actionHook.execute).toHaveBeenCalledExactlyOnceWith({
      contactInboxId: "ci-1",
      action: "release",
    })
  })

  test("stays a plain Release button on a channel whose pass only returns to the AI", () => {
    threadControlState.view = view({ channel: "messenger" })
    render()

    expect(trigger()).toBeNull()
    expect(plainRelease()).not.toBeNull()
  })

  test("becomes one icon that offers Release or Pass to a partner", () => {
    render()

    expect(plainRelease()).toBeNull()
    expect(trigger()).not.toBeNull()

    pressSequence(trigger())
    expect(menuItem("Release")).toBeDefined()
    expect(menuItem("Pass to a partner")).toBeDefined()
  })

  test("choosing Release in the menu releases the thread without a dialog", () => {
    render()
    pressSequence(trigger())
    pressSequence(menuItem("Release"))

    expect(actionHook.execute).toHaveBeenCalledExactlyOnceWith({
      contactInboxId: "ci-1",
      action: "release",
    })
    expect(
      document.body.querySelector('[data-testid="pass-dialog"]'),
    ).toBeNull()
  })

  test("choosing Pass to a partner opens the pass dialog and releases nothing", () => {
    render()
    pressSequence(trigger())
    pressSequence(menuItem("Pass to a partner"))

    expect(
      document.body.querySelector('[data-testid="pass-dialog"]'),
    ).not.toBeNull()
    expect(actionHook.execute).not.toHaveBeenCalled()
  })

  test("each choice shows its explanation under the label, without hovering", () => {
    render()
    pressSequence(trigger())

    expect(menuItem("Release")?.textContent).toContain(
      messages.conversationRouting.release.tooltip,
    )
    expect(menuItem("Pass to a partner")?.textContent).toContain(
      messages.conversationRouting.pass.description,
    )
  })

  test("disables the icon while an action is running", () => {
    actionHook.isExecuting = true
    render()

    expect(trigger()?.disabled).toBe(true)
  })
})
