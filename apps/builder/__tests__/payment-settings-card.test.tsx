import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const refresh = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

type Callbacks = {
  onSuccess?: (result: { data?: { pixRedirectEnabled: boolean } }) => void
  onError?: (result: { error: { serverError?: string } }) => void
}
const hookState = vi.hoisted(() => ({
  callbacks: undefined as Callbacks | undefined,
  execute: vi.fn(),
  isExecuting: false,
}))
vi.mock("next-safe-action/hooks", () => ({
  useAction: (_action: unknown, callbacks: Callbacks) => {
    hookState.callbacks = callbacks
    return { execute: hookState.execute, isExecuting: hookState.isExecuting }
  },
}))

const bindMock = vi.hoisted(() => vi.fn(() => "bound-action"))
vi.mock(
  "@/features/integration-whatsapp/payment/actions/update-pix-redirect.action",
  () => ({ updatePixRedirectAction: { bind: bindMock } }),
)

// jsdom ships no ResizeObserver or PointerEvent, and the Switch needs both.
Object.assign(globalThis, {
  ResizeObserver: class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  },
})
if (typeof globalThis.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    constructor(type: string, params: MouseEventInit = {}) {
      super(type, params)
    }
  }
  Object.assign(globalThis, { PointerEvent: PointerEventPolyfill })
}

const { PaymentSettingsCard } = await import(
  "@/features/integration-whatsapp/payment/components/payment-settings-card"
)

describe("PaymentSettingsCard", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (props: {
    isSuperAdmin: boolean
    pixRedirectEnabled: boolean
  }) =>
    act(() => {
      root.render(
        <PaymentSettingsCard
          integrationWhatsappId="wa-1"
          workspaceId="ws-1"
          {...props}
        />,
      )
    })

  const toggle = () => container.querySelector('[role="switch"]') as HTMLElement

  beforeEach(() => {
    vi.clearAllMocks()
    hookState.isExecuting = false
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("binds the action to the workspace and number", () => {
    render({ isSuperAdmin: true, pixRedirectEnabled: false })
    expect(bindMock).toHaveBeenCalledWith(null, "ws-1", "wa-1")
  })

  test("reflects the stored policy", () => {
    render({ isSuperAdmin: true, pixRedirectEnabled: true })
    expect(toggle().getAttribute("aria-checked")).toBe("true")
  })

  test("turning it on saves immediately and confirms with a toast", () => {
    render({ isSuperAdmin: true, pixRedirectEnabled: false })

    act(() => toggle().click())
    expect(hookState.execute).toHaveBeenCalledWith({ pixRedirectEnabled: true })

    act(() =>
      hookState.callbacks?.onSuccess?.({ data: { pixRedirectEnabled: true } }),
    )
    expect(toggle().getAttribute("aria-checked")).toBe("true")
    expect(toast.success).toHaveBeenCalledWith("messages.savedSuccessfully")
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  test("a failed save keeps the stored value and shows the server error", () => {
    render({ isSuperAdmin: true, pixRedirectEnabled: false })

    act(() => toggle().click())
    act(() =>
      hookState.callbacks?.onError?.({ error: { serverError: "nope" } }),
    )

    expect(toggle().getAttribute("aria-checked")).toBe("false")
    expect(toast.error).toHaveBeenCalledWith("nope")
    expect(refresh).not.toHaveBeenCalled()
  })

  test("is disabled for non admins and explains why", () => {
    render({ isSuperAdmin: false, pixRedirectEnabled: false })

    expect(toggle().hasAttribute("data-disabled")).toBe(true)
    expect(container.textContent).toContain(
      "whatsapp.payment.settings.adminOnly",
    )
    act(() => toggle().click())
    expect(hookState.execute).not.toHaveBeenCalled()
  })

  test("is disabled while saving", () => {
    hookState.isExecuting = true
    render({ isSuperAdmin: true, pixRedirectEnabled: false })

    expect(toggle().hasAttribute("data-disabled")).toBe(true)
  })
})
