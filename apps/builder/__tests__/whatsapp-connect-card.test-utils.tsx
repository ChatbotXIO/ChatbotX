import type { WhatsappCredentialPublic } from "@chatbotx.io/database/partials"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { vi } from "vitest"
import WhatsappCreate from "@/features/integration-whatsapp/components/whatsapp-create"
import { WA_OAUTH_RESULT } from "@/features/integration-whatsapp/libs/embedded-signup"

/**
 * Shared fixtures + DOM harness for the `WhatsappCreate` connect-card suite,
 * split across `whatsapp-connect-card.test.tsx` (card shell, manual connect,
 * direct-submit toasts), `whatsapp-connect-card.picker.test.tsx` (the
 * multi-select phone-number picker) and
 * `whatsapp-connect-card.post-connect.test.tsx`. Each file keeps its own
 * `vi.mock` block — mocking is file-scoped in Vitest — and its own
 * `beforeEach`/`afterEach` mount lifecycle.
 */

export const BROKER_ORIGIN = "https://broker.test"
export const OAUTH_CALLBACK_URL = `${BROKER_ORIGIN}/integrations/whatsapp/callback`
export const OAUTH_CODE = "AQD-relayed-code"

export type MockedConnectActionResult = {
  data?: Record<string, unknown>
  /** What `handleServerError` returns when the action throws — the action itself never rejects. */
  serverError?: string
}
export type MockedConnectActionInput = Record<string, unknown>

/**
 * jsdom ships neither ResizeObserver (Radix measures the switch thumb through
 * it), PointerEvent (Base UI's Switch/Checkbox/Radio need one to process a
 * click), nor `window.open` (the SDK launch button calls it directly).
 */
export function installDomPolyfills() {
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
  Object.assign(window, { open: vi.fn(() => ({}) as Window) })
}

/**
 * React tracks an input's value through its own internal setter — assigning
 * `.value` directly and dispatching a bubbling "input" event leaves that
 * tracker stale, so React never sees the change. Going through the native
 * prototype setter first is the standard workaround.
 */
export function setNativeInputValue(
  input: HTMLInputElement | null,
  value: string,
) {
  if (!input) {
    return
  }
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

export const SETTINGS: WhatsappCredentialPublic = {
  clientId: "client-id",
  configId: "config-id",
  version: "v23.0",
  systemUserId: "system-user-id",
  businessName: "Acme",
  verifyToken: "verify-token",
}

export const PHONE_A = {
  id: "phone-a",
  verified_name: "Phone A",
  display_phone_number: "+1 555 0001",
}
export const PHONE_B = {
  id: "phone-b",
  verified_name: "Phone B",
  display_phone_number: "+1 555 0002",
}

type ConnectedExtra = {
  requiresPhoneVerification: boolean
  registrationError: null
  displayPhoneNumber: string
  verifiedName: string
  manual?: {
    integrationId: string
    workspaceId: string
    webhookUrl: string
    verifyToken: string
  }
}

export function connectedResult(params: {
  phoneNumberId: string
  workspaceId?: string
  extra?: Partial<ConnectedExtra>
  coexistEligible?: boolean
  integrationId?: string
}) {
  const workspaceId = params.workspaceId ?? "ws-1"
  return {
    data: {
      type: "connected",
      workspaceId,
      isManual: false,
      redirectUrl: `/space/${workspaceId}`,
      outcome: {
        sourceId: params.phoneNumberId,
        name: params.phoneNumberId,
        status: "connected",
        integrationId:
          params.integrationId ?? `integration-${params.phoneNumberId}`,
        coexistEligible: params.coexistEligible ?? false,
        extra: {
          requiresPhoneVerification: false,
          registrationError: null,
          displayPhoneNumber: "+1 555 0000",
          verifiedName: params.phoneNumberId,
          ...params.extra,
        },
      },
    },
  }
}

export const phoneNumberSelectionResult = (
  extraPhoneNumbers: {
    id: string
    label: string
    displayPhoneNumber: string
    disabled?: boolean
  }[] = [],
) => ({
  data: {
    type: "phoneNumberSelection",
    signupSessionId: "session-1",
    phoneNumbers: [
      {
        id: PHONE_A.id,
        label: PHONE_A.verified_name,
        displayPhoneNumber: PHONE_A.display_phone_number,
      },
      {
        id: PHONE_B.id,
        label: PHONE_B.verified_name,
        displayPhoneNumber: PHONE_B.display_phone_number,
      },
      ...extraPhoneNumbers,
    ],
  },
})

/**
 * Mounts `WhatsappCreate` and exposes the DOM queries every file in the suite
 * uses. The container is owned here so the helpers can close over it instead
 * of every test file re-declaring them.
 */
export function createCardHarness() {
  let container: HTMLDivElement
  let root: Root

  const click = (el: Element | null | undefined) => {
    act(() => {
      el?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
  }

  const findButtonByText = (text: string) =>
    Array.from(container.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.includes(text),
    )

  return {
    mount: () => {
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
      container = document.createElement("div")
      document.body.append(container)
      root = createRoot(container)
      act(() => {
        root.render(
          <WhatsappCreate
            oauthCallbackUrl={OAUTH_CALLBACK_URL}
            settings={SETTINGS}
            workspaceId="ws-1"
          />,
        )
      })
    },
    unmount: () => {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
    get container() {
      return container
    },
    relayCode: (code = OAUTH_CODE) => {
      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: { type: WA_OAUTH_RESULT, status: "success", code },
            origin: BROKER_ORIGIN,
          }),
        )
      })
    },
    flush: async (ms = 10) => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, ms))
      })
    },
    click,
    switches: () =>
      Array.from(
        container.querySelectorAll<HTMLButtonElement>('[role="switch"]'),
      ),
    /** Index 0 is always the picker's own "select all" header checkbox. */
    checkboxes: () =>
      Array.from(
        container.querySelectorAll<HTMLButtonElement>('[role="checkbox"]'),
      ),
    radios: () =>
      Array.from(
        container.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
      ),
    findButtonByText,
    clickButtonByText: (text: string) => {
      const button = findButtonByText(text)
      if (!button) {
        throw new Error(`No button found with text "${text}"`)
      }
      click(button)
      return button
    },
  }
}
