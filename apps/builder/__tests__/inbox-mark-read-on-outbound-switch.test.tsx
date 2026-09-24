import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      "inboxes.markReadOnOutbound.enabled": "Enabled",
      "inboxes.markReadOnOutbound.disabled": "Disabled",
    })[key] ?? key,
}))

vi.mock("@chatbotx.io/ui/components/ui/switch", () => ({
  Switch: ({
    "aria-label": ariaLabel,
    checked,
    disabled,
    id,
    onCheckedChange,
  }: {
    "aria-label"?: string
    checked: boolean
    disabled?: boolean
    id?: string
    onCheckedChange: (checked: boolean) => void
  }) => (
    <button
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      id={id}
      onClick={() => onCheckedChange(!checked)}
      role="switch"
      type="button"
    />
  ),
}))

const executeMock = vi.fn()
const invalidateInboxesMock = vi.fn()
const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()
let actionPending = false
let actionOptions:
  | {
      onSuccess?: (result: { data?: { markReadOnOutbound: boolean } }) => void
      onError?: (result: { error: { serverError?: string } }) => void
    }
  | undefined
let inboxQuery = {
  data: [
    {
      id: "inbox-1",
      markReadOnOutbound: true,
    },
  ],
  isLoading: false,
}

vi.mock("next-safe-action/hooks", () => ({
  useAction: (_action: unknown, options: typeof actionOptions) => {
    actionOptions = options
    return { execute: executeMock, isPending: actionPending }
  },
}))

vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}))

vi.mock("@/features/inboxes/provider/inbox-hook", () => ({
  useInboxes: () => inboxQuery,
  useInvalidateInboxes: () => invalidateInboxesMock,
}))

vi.mock(
  "@/features/inboxes/actions/update-mark-read-on-outbound.action",
  () => ({
    updateMarkReadOnOutboundAction: {
      bind: () => ({ __name: "updateMarkReadOnOutbound" }),
    },
  }),
)

const { InboxMarkReadOnOutboundSwitch } = await import(
  "@/features/inboxes/components/inbox-mark-read-on-outbound-switch"
)

describe("InboxMarkReadOnOutboundSwitch", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    actionPending = false
    actionOptions = undefined
    inboxQuery = {
      data: [{ id: "inbox-1", markReadOnOutbound: true }],
      isLoading: false,
    }
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = () =>
    act(() => {
      root.render(
        <InboxMarkReadOnOutboundSwitch
          inboxId="inbox-1"
          workspaceId="workspace-1"
        />,
      )
    })

  test("renders the inbox value, calls the action, and invalidates on success", () => {
    render()

    const toggle = container.querySelector<HTMLButtonElement>("[role=switch]")
    expect(toggle?.getAttribute("aria-checked")).toBe("true")
    expect(container.textContent).toContain("Enabled")

    act(() => toggle?.click())
    expect(executeMock).toHaveBeenCalledWith({ enabled: false })

    act(() => {
      actionOptions?.onSuccess?.({ data: { markReadOnOutbound: false } })
    })
    expect(invalidateInboxesMock).toHaveBeenCalledTimes(1)
    expect(toastSuccessMock).toHaveBeenCalledWith("messages.updatedSuccess")
  })

  test("renders an accessible switch with its state text", () => {
    render()

    const toggle = container.querySelector<HTMLButtonElement>("[role=switch]")
    expect(toggle?.getAttribute("aria-label")).toBe(
      "inboxes.markReadOnOutbound.label",
    )
    expect(container.textContent).toContain("Enabled")
  })

  test("updates the state text when the inbox value changes", () => {
    render()

    inboxQuery = {
      data: [{ id: "inbox-1", markReadOnOutbound: false }],
      isLoading: false,
    }
    render()

    expect(container.textContent).toContain("Disabled")
  })

  test("disables the switch while the action is pending", () => {
    actionPending = true
    render()

    expect(
      container.querySelector<HTMLButtonElement>("[role=switch]")?.disabled,
    ).toBe(true)
  })

  test("disables the switch while inboxes are loading", () => {
    inboxQuery = {
      data: [],
      isLoading: true,
    }
    render()

    expect(
      container.querySelector<HTMLButtonElement>("[role=switch]")?.disabled,
    ).toBe(true)
  })

  test("shows the server error without invalidating inboxes", () => {
    render()

    act(() => {
      actionOptions?.onError?.({ error: { serverError: "Update failed" } })
    })

    expect(toastErrorMock).toHaveBeenCalledWith("Update failed")
    expect(invalidateInboxesMock).not.toHaveBeenCalled()
  })

  test("disables the switch when the inbox is unavailable after loading", () => {
    inboxQuery = {
      data: [{ id: "another-inbox", markReadOnOutbound: true }],
      isLoading: false,
    }
    render()

    const toggle = container.querySelector<HTMLButtonElement>("[role=switch]")
    expect(toggle?.disabled).toBe(true)

    act(() => toggle?.click())
    expect(executeMock).not.toHaveBeenCalled()
  })
})
