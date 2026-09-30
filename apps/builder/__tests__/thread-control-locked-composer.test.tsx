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

vi.mock("@/features/messages/components/input-menu", () => ({
  SendFlowDialogTrigger: ({ children }: { children: React.ReactNode }) =>
    children,
}))

const onDismiss = vi.fn()

const { ThreadControlLockedComposer } = await import(
  "@/features/messages/components/thread-control-locked-composer"
)

describe("ThreadControlLockedComposer", () => {
  let container: HTMLDivElement
  let root: Root

  const render = () =>
    act(() => {
      root.render(
        <ThreadControlLockedComposer
          contactInboxId="ci-1"
          conversationId="conv-1"
          onDismiss={onDismiss}
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
    expect(patchContactInboxThreadControl).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
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
