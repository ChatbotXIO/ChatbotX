import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { WhatsappCallsCard } from "@/features/integration-whatsapp/calling/whatsapp-calls-card"

const META_ERROR = "Calling APIs cannot be enabled for this phone number."

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const { toastErrorMock, useActionMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  useActionMock: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: vi.fn() },
}))

vi.mock("next-safe-action/hooks", () => ({
  useAction: useActionMock,
}))

vi.mock(
  "@/features/integration-whatsapp/calling/actions/update-calling-settings.action",
  () => ({
    updateWhatsappCallingSettingsAction: { bind: () => vi.fn() },
  }),
)

vi.mock(
  "@/features/integration-whatsapp/calling/actions/fix-whatsapp-calls-subscription.action",
  () => ({
    fixWhatsappCallsSubscriptionAction: { bind: () => vi.fn() },
  }),
)

vi.mock(
  "@/features/integration-whatsapp/calling/actions/whatsapp-sip-provisioning.action",
  () => ({
    provisionWhatsappSipAction: { bind: () => vi.fn() },
    deprovisionWhatsappSipAction: { bind: () => vi.fn() },
  }),
)

// jsdom ships no ResizeObserver, and Radix measures the switch thumb through it.
Object.assign(globalThis, {
  ResizeObserver: class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  },
})

// jsdom ships no PointerEvent constructor; the Switch's click handler
// re-dispatches one to drive its underlying <input type="checkbox">.
if (typeof globalThis.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    constructor(type: string, params: MouseEventInit = {}) {
      super(type, params)
    }
  }
  Object.assign(globalThis, { PointerEvent: PointerEventPolyfill })
}

type ActionCallbacks = {
  onSuccess: () => void
  onError: (args: { error: { serverError?: string } }) => void
}

describe("WhatsappCallsCard", () => {
  let container: HTMLDivElement
  let root: Root
  let allCallbacks: ActionCallbacks[]

  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    allCallbacks = []
    useActionMock.mockImplementation(
      (_action: unknown, opts: ActionCallbacks) => {
        allCallbacks.push(opts)
        return { execute: vi.fn(), isPending: false }
      },
    )
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = (
    props: Partial<Parameters<typeof WhatsappCallsCard>[0]> = {},
  ) =>
    act(() => {
      root.render(
        <WhatsappCallsCard
          integrationWhatsappId="integration-1"
          settings={{ status: "DISABLED" }}
          workspaceId="workspace-1"
          {...props}
        />,
      )
    })

  test("keeps Meta's rejection visible in the card after the toast", async () => {
    await render()
    // Index 0 is the settings-update action — the first `useAction` call in
    // the component tree (`SipProvisioningControls`'s hooks run after it).
    const settingsCallbacks = allCallbacks[0]

    act(() => {
      settingsCallbacks.onError({ error: { serverError: META_ERROR } })
    })

    expect(toastErrorMock).toHaveBeenCalledWith(META_ERROR)
    const alert = container.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain(META_ERROR)
    expect(alert?.textContent).toContain("whatsapp.calls.updateFailedTitle")
  })

  test("clears the inline error once a later save succeeds", async () => {
    await render()
    const settingsCallbacks = allCallbacks[0]

    act(() => {
      settingsCallbacks.onError({ error: { serverError: META_ERROR } })
    })
    act(() => {
      settingsCallbacks.onSuccess()
    })

    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  test("shows the none provisioning status and a Provision button for super admins", async () => {
    await render({ isSuperAdmin: true, sipProvisioningStatus: "none" })
    expect(container.textContent).toContain("whatsapp.calls.sip.status.none")
    expect(container.textContent).toContain(
      "whatsapp.calls.sip.provisionButton",
    )
    expect(container.textContent).not.toContain(
      "whatsapp.calls.sip.deprovisionButton",
    )
  })

  test("shows a Deprovision button once provisioned, still super-admin only", async () => {
    await render({ isSuperAdmin: true, sipProvisioningStatus: "provisioned" })
    expect(container.textContent).toContain(
      "whatsapp.calls.sip.deprovisionButton",
    )
    expect(container.textContent).not.toContain(
      "whatsapp.calls.sip.provisionButton",
    )
  })

  test("hides provisioning action buttons for non-super-admins", async () => {
    await render({ isSuperAdmin: false, sipProvisioningStatus: "none" })
    expect(container.textContent).not.toContain(
      "whatsapp.calls.sip.provisionButton",
    )
  })

  test("the in-app calling switch is disabled until sipProvisioningStatus is provisioned or enabled", async () => {
    await render({
      sipProvisioningStatus: "none",
      settings: { status: "ENABLED" },
    })
    // Radix/Base UI's Switch renders `role="switch"` on a <span>, not a <button>.
    const switches = container.querySelectorAll('[role="switch"]')
    // enable, icon visibility, callback permission, in-app calling, recording, transcription
    expect(switches.length).toBe(6)
    const inAppCallingSwitch = switches[3]
    expect(inAppCallingSwitch.getAttribute("data-disabled")).not.toBeNull()
  })

  test("the in-app calling switch is enabled once provisioned", async () => {
    await render({
      sipProvisioningStatus: "provisioned",
      settings: { status: "ENABLED" },
    })
    const switches = container.querySelectorAll('[role="switch"]')
    expect(switches.length).toBe(6)
    const inAppCallingSwitch = switches[3]
    expect(inAppCallingSwitch.getAttribute("data-disabled")).toBeNull()
  })

  test("reverts the transcription switch when the save fails", async () => {
    await render({
      settings: { status: "ENABLED" },
      transcriptionEnabled: false,
    })
    const settingsCallbacks = allCallbacks[0]
    const switches = container.querySelectorAll('[role="switch"]')
    // enable, icon visibility, callback permission, in-app calling, recording, transcription
    const transcriptionSwitch = switches[5]
    expect(transcriptionSwitch.getAttribute("aria-checked")).toBe("false")

    act(() => {
      ;(transcriptionSwitch as HTMLButtonElement).click()
    })
    expect(transcriptionSwitch.getAttribute("aria-checked")).toBe("true")

    act(() => {
      settingsCallbacks.onError({ error: { serverError: META_ERROR } })
    })
    expect(transcriptionSwitch.getAttribute("aria-checked")).toBe("false")
  })
})
