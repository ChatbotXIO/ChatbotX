import type { ThreadControlChannel } from "@chatbotx.io/utils/channel"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

vi.mock("@/features/tenant/tenant-settings-provider", () => ({
  useTenantSettings: () => ({ name: "AhaChat" }),
}))

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

type ActionCallbacks = {
  onExecute?: () => void
  onSuccess?: (result: { data?: unknown; input: { action: string } }) => void
  onError?: (result: { error: { serverError?: string } }) => void
}
const hookState = vi.hoisted(() => ({
  callbacks: undefined as ActionCallbacks | undefined,
  execute: vi.fn(),
  isExecuting: false,
}))
vi.mock("next-safe-action/hooks", () => ({
  useAction: (_action: unknown, callbacks: ActionCallbacks) => {
    hookState.callbacks = callbacks
    return {
      execute: hookState.execute,
      isExecuting: hookState.isExecuting,
      input: undefined,
    }
  },
}))

const bindMock = vi.hoisted(() => vi.fn(() => "bound-action"))
vi.mock("@/features/conversations/actions/thread-control.action", () => ({
  threadControlAction: { bind: bindMock },
}))

const patchContactInboxThreadControl = vi.fn()
vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: (
    selector: (state: {
      patchContactInboxThreadControl: typeof patchContactInboxThreadControl
    }) => unknown,
  ) => selector({ patchContactInboxThreadControl }),
}))

const sendFlowTrigger = vi.hoisted(() => ({
  templateStartType: undefined as string | undefined,
}))
vi.mock("@/features/messages/components/input-menu", () => ({
  SendFlowDialogTrigger: ({
    children,
    templateStartType,
  }: {
    children: React.ReactNode
    templateStartType?: string
  }) => {
    sendFlowTrigger.templateStartType = templateStartType
    return children
  },
}))

const onDismiss = vi.fn()
const refuse = () =>
  act(() =>
    hookState.callbacks?.onSuccess?.({
      data: { status: "notEscalation" },
      input: { action: "take" },
    }),
  )

const { ThreadControlLockedComposer } = await import(
  "@/features/messages/components/thread-control-locked-composer"
)

describe("ThreadControlLockedComposer", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (
    channel: ThreadControlChannel = "whatsapp",
    revealOnTakeOver = false,
  ) =>
    act(() => {
      root.render(
        <ThreadControlLockedComposer
          channel={channel}
          contactInboxId="ci-1"
          conversationId="conv-1"
          onDismiss={onDismiss}
          revealOnTakeOver={revealOnTakeOver}
          workspaceId="ws-1"
        />,
      )
    })

  beforeEach(() => {
    vi.clearAllMocks()
    hookState.isExecuting = false
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    render()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const buttonByText = (text: string) =>
    Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes(text),
    )

  test("binds the action to the workspace and conversation", () => {
    expect(bindMock).toHaveBeenCalledWith(null, "ws-1", "conv-1")
  })

  test("announces the standby status in a status region", () => {
    const status = container.querySelector('[role="status"]')
    expect(status?.textContent).toContain("conversationRouting.composer.title")
    // The title no longer names the owner (white-label, no brand).
    expect(status?.textContent).not.toContain('{"owner"')
  })

  test("the X button dismisses the lock", () => {
    const dismiss = container.querySelector(
      'button[aria-label="conversationRouting.composer.dismiss"]',
    ) as HTMLButtonElement | null
    act(() => dismiss?.click())
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  test("Take over requests a take on the WhatsApp contact inbox", () => {
    act(() => buttonByText("conversationRouting.composer.takeOver")?.click())
    expect(hookState.execute).toHaveBeenCalledWith({
      contactInboxId: "ci-1",
      action: "take",
    })
  })

  test("Take over only reveals the composer (no Meta take) when revealOnTakeOver", () => {
    render("messenger", true)
    act(() => buttonByText("conversationRouting.composer.takeOver")?.click())
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(hookState.execute).not.toHaveBeenCalled()
  })

  test("a successful take patches the store from the snapshot and toasts", () => {
    const snapshot = {
      contactInboxId: "ci-1",
      threadControlState: "owned",
      threadOwnerRole: "escalation",
      threadControlUpdatedAt: new Date("2026-09-29T10:00:00.000Z"),
    }
    act(() =>
      hookState.callbacks?.onSuccess?.({
        data: { status: "applied", snapshot },
        input: { action: "take" },
      }),
    )
    expect(patchContactInboxThreadControl).toHaveBeenCalledWith(
      "conv-1",
      snapshot,
    )
    expect(toast.success).toHaveBeenCalledWith(
      "conversationRouting.composer.takeOverSuccess",
    )
  })

  test("a not-escalation refusal shows the inline error and keeps the lock", () => {
    act(() =>
      hookState.callbacks?.onSuccess?.({
        data: { status: "notEscalation" },
        input: { action: "take" },
      }),
    )
    expect(container.textContent).toContain(
      "conversationRouting.composer.notEscalation",
    )
    expect(container.textContent).not.toContain(
      "conversationRouting.composer.notPrimaryReceiver",
    )
    expect(patchContactInboxThreadControl).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  test("a Messenger refusal shows the primary-receiver copy and the Messenger docs link", () => {
    // Reset the leak from the WhatsApp render in beforeEach: a Messenger render
    // never mounts the Send flow trigger, so nothing would clear it otherwise.
    sendFlowTrigger.templateStartType = undefined
    render("messenger")
    refuse()
    expect(container.textContent).toContain(
      "conversationRouting.composer.notPrimaryReceiver",
    )
    expect(container.textContent).not.toContain(
      "conversationRouting.composer.notEscalation",
    )
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "https://developers.facebook.com/docs/messenger-platform/handover-protocol",
    )
    // Messenger has no template-during-standby bypass, so the Send flow button
    // is hidden — take-over is the only path.
    expect(buttonByText("actions.sendFlow")).toBeUndefined()
    expect(sendFlowTrigger.templateStartType).toBeUndefined()
  })

  test("WhatsApp keeps its docs link and its template tab", () => {
    act(() =>
      hookState.callbacks?.onSuccess?.({
        data: { status: "notEscalation" },
        input: { action: "take" },
      }),
    )
    const link = container.querySelector("a")
    expect(link?.getAttribute("href")).toBe(
      "https://developers.facebook.com/documentation/business-messaging/whatsapp/conversation-routing/thread-control",
    )
    expect(sendFlowTrigger.templateStartType).toBe("sendWaTemplateMessage")
  })

  test("any other failure toasts the mapped server error", () => {
    act(() =>
      hookState.callbacks?.onError?.({
        error: { serverError: "Meta said no" },
      }),
    )
    expect(toast.error).toHaveBeenCalledWith("Meta said no")
    expect(container.textContent).not.toContain(
      "conversationRouting.composer.notEscalation",
    )
  })

  test("disables both buttons while the take is running", () => {
    hookState.isExecuting = true
    render()
    expect(
      buttonByText("conversationRouting.composer.takeOver")?.disabled,
    ).toBe(true)
    expect(buttonByText("actions.sendFlow")?.disabled).toBe(true)
  })
})
