import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/features/tenant/tenant-settings-provider", () => ({
  useTenantSettings: () => ({ name: "AhaChat" }),
}))

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

type Callbacks = {
  onSuccess?: (result: {
    data?: { handoverResumeFlowId: string | null }
  }) => void
  onError?: (result: { error: { serverError?: string } }) => void
}
const hookState = vi.hoisted(() => ({
  callbacks: undefined as Callbacks | undefined,
  execute: vi.fn(),
}))
vi.mock("next-safe-action/hooks", () => ({
  useAction: (_action: unknown, callbacks: Callbacks) => {
    hookState.callbacks = callbacks
    return { execute: hookState.execute, isExecuting: false }
  },
}))

const bindMock = vi.hoisted(() => vi.fn(() => "bound-action"))
vi.mock(
  "@/features/integration-whatsapp/actions/update-handover-resume-flow.action",
  () => ({ updateHandoverResumeFlowAction: { bind: bindMock } }),
)

const selectorProps = vi.hoisted(() => ({
  last: undefined as
    | { value: string; onChange: (value: string) => void }
    | undefined,
}))
vi.mock("@/features/sequences/components/flow-selector", () => ({
  FlowSelectorSimple: (props: {
    value: string
    onChange: (value: string) => void
  }) => {
    selectorProps.last = props
    return <span data-testid="flow-selector">{props.value || "empty"}</span>
  },
}))

vi.mock("@chatbotx.io/ui/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip">{children}</div>
  ),
  TooltipTrigger: ({ render }: { render: React.ReactNode }) => render,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="tooltip-content">{children}</span>
  ),
}))

const { ConversationRoutingCard } = await import(
  "@/features/integration-whatsapp/components/conversation-routing-card"
)

describe("ConversationRoutingCard", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (props: {
    isSuperAdmin: boolean
    handoverResumeFlowId: string | null
  }) =>
    act(() => {
      root.render(
        <ConversationRoutingCard
          integrationWhatsappId="wa-1"
          workspaceId="ws-1"
          {...props}
        />,
      )
    })

  beforeEach(() => {
    vi.clearAllMocks()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("binds the action to the workspace and number", () => {
    render({ isSuperAdmin: true, handoverResumeFlowId: null })
    expect(bindMock).toHaveBeenCalledWith(null, "ws-1", "wa-1")
  })

  const saveButton = () =>
    Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("conversationRouting.settings.save"),
    ) as HTMLButtonElement | undefined

  test("edits stay local until the save button commits them", () => {
    render({ isSuperAdmin: true, handoverResumeFlowId: null })
    act(() => selectorProps.last?.onChange("flow-2"))
    // Selecting a flow must not save on its own.
    expect(hookState.execute).not.toHaveBeenCalled()
    expect(selectorProps.last?.value).toBe("flow-2")

    act(() => saveButton()?.click())
    expect(hookState.execute).toHaveBeenCalledWith({
      handoverResumeFlowId: "flow-2",
    })
    act(() =>
      hookState.callbacks?.onSuccess?.({
        data: { handoverResumeFlowId: "flow-2" },
      }),
    )
    expect(selectorProps.last?.value).toBe("flow-2")
    expect(toast.success).toHaveBeenCalledWith("messages.savedSuccessfully")
  })

  test("keeps the pending edit for retry when the save fails", () => {
    render({ isSuperAdmin: true, handoverResumeFlowId: "flow-1" })
    act(() => selectorProps.last?.onChange("flow-2"))
    act(() => saveButton()?.click())

    act(() =>
      hookState.callbacks?.onError?.({ error: { serverError: "nope" } }),
    )

    expect(selectorProps.last?.value).toBe("flow-2")
    expect(toast.error).toHaveBeenCalledWith("nope")
  })

  test("the save button is disabled until the flow changes", () => {
    render({ isSuperAdmin: true, handoverResumeFlowId: "flow-1" })
    expect(saveButton()?.disabled).toBe(true)
    act(() => selectorProps.last?.onChange("flow-2"))
    expect(saveButton()?.disabled).toBe(false)
  })

  test("clears the flow with the clear button before saving", () => {
    render({ isSuperAdmin: true, handoverResumeFlowId: "flow-1" })
    const clear = container.querySelector(
      'button[aria-label="conversationRouting.settings.clearFlow"]',
    ) as HTMLButtonElement
    act(() => clear.click())
    expect(hookState.execute).not.toHaveBeenCalled()
    expect(selectorProps.last?.value).toBe("")

    act(() => saveButton()?.click())
    expect(hookState.execute).toHaveBeenCalledWith({
      handoverResumeFlowId: null,
    })
  })

  test("disables the picker for a non super admin and explains why", () => {
    render({ isSuperAdmin: false, handoverResumeFlowId: "flow-1" })
    expect(container.querySelector("fieldset")?.disabled).toBe(true)
    expect(
      container.querySelector('[data-testid="tooltip-content"]')?.textContent,
    ).toBe("conversationRouting.settings.adminOnly")
  })

  test("an admin gets no disabled wrapper", () => {
    render({ isSuperAdmin: true, handoverResumeFlowId: null })
    expect(container.querySelector("fieldset")?.disabled).toBe(false)
    expect(container.querySelector('[data-testid="tooltip"]')).toBeNull()
  })
})
