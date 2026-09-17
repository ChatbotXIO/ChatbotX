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

// The call hours form has its own tests; the card only places it.
vi.mock(
  "@/features/integration-whatsapp/calling/whatsapp-call-hours-section",
  () => ({ WhatsappCallHoursSection: () => null }),
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

  /** Switches are addressed by name — their DOM order is not the contract. */
  const settingSwitch = (setting: string) =>
    container.querySelector(`[role="switch"][data-setting="${setting}"]`)

  const checkedState = (setting: string) =>
    settingSwitch(setting)?.getAttribute("aria-checked")

  const toggle = (setting: string) => {
    const element = settingSwitch(setting)
    if (!element) {
      throw new Error(`No "${setting}" switch is rendered`)
    }
    ;(element as HTMLButtonElement).click()
  }

  test("keeps Meta's rejection visible in the card after the toast", async () => {
    await render()
    // Index 0 is the settings-update action — the only `useAction` call in
    // the component tree.
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

  test("reverts the transcription switch when the save fails", async () => {
    await render({
      settings: { status: "ENABLED" },
      recordingEnabled: true,
      transcriptionEnabled: false,
    })
    const settingsCallbacks = allCallbacks[0]
    expect(checkedState("transcription")).toBe("false")

    act(() => {
      toggle("transcription")
    })
    expect(checkedState("transcription")).toBe("true")

    act(() => {
      settingsCallbacks.onError({ error: { serverError: META_ERROR } })
    })
    expect(checkedState("transcription")).toBe("false")
  })

  test("hides the transcription switch while the number does not record calls", async () => {
    await render({
      settings: { status: "ENABLED" },
      recordingEnabled: false,
      transcriptionEnabled: true,
    })

    expect(settingSwitch("transcription")).toBeNull()
    expect(settingSwitch("recording")).not.toBeNull()
  })

  test("turning recording off also turns transcription off, and a failed save restores both", async () => {
    await render({
      settings: { status: "ENABLED" },
      recordingEnabled: true,
      transcriptionEnabled: true,
    })
    const settingsCallbacks = allCallbacks[0]

    act(() => {
      toggle("recording")
    })
    expect(settingSwitch("transcription")).toBeNull()

    act(() => {
      settingsCallbacks.onError({ error: { serverError: META_ERROR } })
    })
    expect(checkedState("recording")).toBe("true")
    expect(checkedState("transcription")).toBe("true")
  })

  test("a failed save never rolls back a switch an earlier save already changed", async () => {
    await render({
      settings: { status: "ENABLED" },
      recordingEnabled: false,
    })
    const settingsCallbacks = allCallbacks[0]

    act(() => {
      toggle("recording")
    })
    act(() => {
      settingsCallbacks.onSuccess()
    })
    act(() => {
      toggle("iconVisibility")
    })
    act(() => {
      settingsCallbacks.onError({ error: { serverError: META_ERROR } })
    })

    expect(checkedState("iconVisibility")).toBe("true")
    expect(checkedState("recording")).toBe("true")
  })

  // The inbound toggle saves through the same action as the rest, so a refusal
  // must put it back too — otherwise the card claims calls are muted while the
  // gate still rings agents.
  test("reverts the inbound switch when the save fails", async () => {
    await render({
      settings: { status: "ENABLED" },
      inboundCallsEnabled: true,
    })
    const settingsCallbacks = allCallbacks[0]

    act(() => {
      toggle("inbound")
    })
    expect(checkedState("inbound")).toBe("false")

    act(() => {
      settingsCallbacks.onError({ error: { serverError: META_ERROR } })
    })
    expect(checkedState("inbound")).toBe("true")
  })

  test("the inbound switch cannot be touched while calling itself is off", async () => {
    await render({ settings: { status: "DISABLED" } })

    expect(settingSwitch("inbound")?.hasAttribute("data-disabled")).toBe(true)
    expect(settingSwitch("recording")?.hasAttribute("data-disabled")).toBe(true)
  })
})
