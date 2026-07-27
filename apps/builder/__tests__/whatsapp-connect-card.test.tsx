import type { WhatsappCredentialPublic } from "@chatbotx.io/database/partials"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import WhatsappCreate from "@/features/integration-whatsapp/components/whatsapp-create"
import { WA_OAUTH_RESULT } from "@/features/integration-whatsapp/libs/embedded-signup"

const BROKER_ORIGIN = "https://broker.test"
const OAUTH_CODE = "AQD-relayed-code"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock("@/lib/oauth-broker", () => ({
  getBrokerOrigin: () => BROKER_ORIGIN,
}))

vi.mock("@/features/integration-whatsapp/actions/connect.action", () => ({
  connectWhatsappAction: vi.fn(async () => ({ data: undefined })),
}))

vi.mock("@/features/integration-whatsapp/verification/actions", () => ({
  requestWhatsappVerificationCodeAction: vi.fn(async () => ({
    data: undefined,
  })),
  verifyWhatsappPhoneCodeAction: vi.fn(async () => ({ data: undefined })),
}))

vi.mock("@/features/inboxes/components/inbox-icon", () => ({
  InboxIcon: () => null,
}))

vi.mock("@/features/shared/coexist-popup", () => ({
  CoexistPopup: () => null,
}))

// jsdom ships no ResizeObserver, and Radix measures the switch thumb through it.
Object.assign(globalThis, {
  ResizeObserver: class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  },
})

const SETTINGS: WhatsappCredentialPublic = {
  clientId: "client-id",
  configId: "config-id",
  version: "v23.0",
  systemUserId: "system-user-id",
  businessName: "Acme",
  verifyToken: "verify-token",
}

describe("WhatsappCreate connect card", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)

    act(() => {
      root.render(<WhatsappCreate settings={SETTINGS} workspaceId="ws-1" />)
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  const relayCode = () => {
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: WA_OAUTH_RESULT, status: "success", code: OAUTH_CODE },
          origin: BROKER_ORIGIN,
        }),
      )
    })
  }

  const switches = () =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('[role="switch"]'))
  /** Each option's on/off state, in render order. */
  const optionStates = () =>
    switches().map((option) => option.getAttribute("aria-checked"))
  // Every control inherits the frozen state from the fieldset, which is what
  // `:disabled` resolves through, so the fieldset carries that assertion.
  const fieldset = () => container.querySelector("fieldset")
  // A Radix switch is itself a `type="button"` element, so the card's single
  // action is whichever button is not one of the switches.
  const actionButton = () =>
    Array.from(container.querySelectorAll("button")).find(
      (button) => button.getAttribute("role") !== "switch",
    )

  test("offers the connect options unfrozen before Meta returns a code", () => {
    expect(switches().length).toBeGreaterThan(0)
    expect(fieldset()?.disabled).toBe(false)
    expect(actionButton()?.textContent).toBe("actions.continue")
    expect(actionButton()?.disabled).toBe(false)
  })

  test("freezes the connect options in place instead of hiding them", () => {
    const statesBefore = optionStates()

    relayCode()

    // Three things at once, and the regression was each of them in turn: the
    // options stay on screen, they all go disabled (so the existing `disabled:`
    // styles dim them), and every on/off choice the user made is still shown.
    expect(switches().length).toBe(statesBefore.length)
    expect(fieldset()?.disabled).toBe(true)
    expect(optionStates()).toEqual(statesBefore)
  })

  test("reports the connect as in progress the moment the code arrives", () => {
    relayCode()

    // No waiting step to observe any more — the card goes straight to connecting.
    expect(actionButton()?.textContent).toContain(
      "whatsapp.autoConnect.inProgress",
    )
    // The launch affordance is replaced, not merely covered: the one remaining
    // action is the frozen status control, so no second signup can be started.
    expect(actionButton()?.type).toBe("submit")
    expect(actionButton()?.disabled).toBe(true)
  })
})
