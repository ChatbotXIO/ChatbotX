import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { ThreadControlView } from "@/features/conversations/utils/thread-control"
import messages from "../messages/en.json"

vi.mock("@/features/tenant/tenant-settings-provider", () => ({
  useTenantSettings: () => ({ name: "AhaChat" }),
}))

const threadControlState = vi.hoisted(() => ({
  view: null as ThreadControlView | null,
}))
vi.mock("@/features/conversations/hooks/use-thread-control", () => ({
  useThreadControl: () => threadControlState.view,
}))

const actionHook = vi.hoisted(() => ({
  execute: vi.fn(),
  isExecuting: false,
  lastInput: undefined as { passTarget?: string } | undefined,
}))
vi.mock("@/features/conversations/hooks/use-thread-control-action", () => ({
  useThreadControlAction: (input: { passTarget?: string }) => {
    actionHook.lastInput = input
    return {
      execute: actionHook.execute,
      isExecuting: actionHook.isExecuting,
    }
  },
}))

const { ThreadControlPassButton } = await import(
  "@/features/conversations/components/thread-control-pass-button"
)
const { ThreadControlPassMenuItem } = await import(
  "@/features/conversations/components/thread-control-pass-menu-item"
)

const NOW = new Date("2026-09-29T12:00:00.000Z")

const view = (
  overrides: Partial<ThreadControlView> = {},
): ThreadControlView => ({
  contactInboxId: "ci-1",
  channel: "messenger",
  state: "owned",
  ownerRole: null,
  ownerAppId: null,
  updatedAt: NOW,
  canRelease: false,
  canPass: true,
  isLocked: false,
  inlineReplyTakesOver: false,
  idleAt: null,
  now: NOW,
  ...overrides,
})

type Conversation = Parameters<
  typeof ThreadControlPassButton
>[0]["conversation"]

const conversation = {
  id: "conv-1",
  workspaceId: "ws-1",
  contactInboxes: [{ id: "ci-1", channel: "messenger" }],
} as unknown as Conversation

const conversationWithInbox = (channel: string) =>
  ({
    ...conversation,
    contactInboxes: [{ id: "ci-only", channel }],
  }) as unknown as Conversation

describe("ThreadControlPassButton (header: return to the AI)", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (target: Conversation = conversation) =>
    act(() => {
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <ThreadControlPassButton conversation={target} />
        </NextIntlClientProvider>,
      )
    })

  const headerButton = () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="BizAI"]')

  const dialogConfirm = () =>
    Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Hand back",
    )

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    threadControlState.view = view()
    actionHook.execute.mockClear()
    actionHook.isExecuting = false
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("shows while this app owns a Messenger thread", () => {
    render()
    expect(headerButton()).not.toBeNull()
  })

  test("shows for a Messenger thread whose routing was never observed (v1 parity) and passes on that inbox", () => {
    threadControlState.view = null
    render(conversationWithInbox("messenger"))
    expect(headerButton()).not.toBeNull()

    act(() => headerButton()?.click())
    act(() => dialogConfirm()?.click())
    expect(actionHook.execute).toHaveBeenCalledExactlyOnceWith({
      contactInboxId: "ci-only",
      action: "pass",
    })
  })

  test("asks for confirmation, then passes the thread to the AI", () => {
    render()

    act(() => headerButton()?.click())
    expect(document.body.textContent).toContain(
      "Hand back to the AI assistant?",
    )
    expect(actionHook.execute).not.toHaveBeenCalled()
    expect(actionHook.lastInput?.passTarget).toBe("aiAgent")

    act(() => dialogConfirm()?.click())
    expect(actionHook.execute).toHaveBeenCalledExactlyOnceWith({
      contactInboxId: "ci-1",
      action: "pass",
    })
  })

  test("disables the confirm button while the pass is running", () => {
    actionHook.isExecuting = true
    render()

    act(() => headerButton()?.click())
    expect(dialogConfirm()?.hasAttribute("disabled")).toBe(true)
  })
})

describe("ThreadControlPassMenuItem (actions menu: escalation only)", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("is hidden on a channel that passes to the AI (the header button owns it)", () => {
    threadControlState.view = view({ channel: "messenger" })
    act(() => {
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <ThreadControlPassMenuItem conversation={conversation} />
        </NextIntlClientProvider>,
      )
    })
    expect(container.textContent).toBe("")
  })
})
