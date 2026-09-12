import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { WhatsappCallingPreflight } from "@/features/integration-whatsapp/calling/get-whatsapp-calling-preflight"
import { WhatsappCallsCard } from "@/features/integration-whatsapp/calling/whatsapp-calls-card"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const { toastErrorMock, toastSuccessMock, useActionMock, executeMock } =
  vi.hoisted(() => ({
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    useActionMock: vi.fn(),
    executeMock: vi.fn(),
  }))

vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock },
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

const basePreflight: WhatsappCallingPreflight = {
  isManual: false,
  hasAppCredential: true,
  callsSubscribed: true,
  platformType: "CLOUD_API",
  isCloudApiPlatform: true,
  messagingLimitTier: "TIER_2K",
  messagingLimitSufficient: true,
}

describe("WhatsappCallsCard calling preflight", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    useActionMock.mockImplementation(() => ({
      execute: executeMock,
      isPending: false,
    }))
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = (props: {
    preflight?: WhatsappCallingPreflight | null
    isSuperAdmin?: boolean
  }) =>
    act(() => {
      root.render(
        <WhatsappCallsCard
          integrationWhatsappId="integration-1"
          isSuperAdmin={props.isSuperAdmin}
          preflight={props.preflight}
          settings={{ status: "DISABLED" }}
          workspaceId="workspace-1"
        />,
      )
    })

  test("renders nothing extra when every check passes", async () => {
    await render({ preflight: basePreflight })

    expect(container.textContent).not.toContain(
      "whatsapp.calls.preflight.title",
    )
  })

  test("shows the calls-not-subscribed notice when the app lacks the field", async () => {
    await render({
      preflight: { ...basePreflight, callsSubscribed: false },
    })

    expect(container.textContent).toContain(
      "whatsapp.calls.preflight.callsNotSubscribed",
    )
  })

  test("shows the coexistence warning when the number is not Cloud API", async () => {
    await render({
      preflight: {
        ...basePreflight,
        platformType: "NOT_APPLICABLE",
        isCloudApiPlatform: false,
      },
    })

    expect(container.textContent).toContain(
      "whatsapp.calls.preflight.coexistenceWarning",
    )
  })

  test("shows the messaging-limit-too-low notice when the limit is below 2000 (Meta error 138015)", async () => {
    await render({
      preflight: {
        ...basePreflight,
        messagingLimitTier: "TIER_250",
        messagingLimitSufficient: false,
      },
    })

    expect(container.textContent).toContain(
      "whatsapp.calls.preflight.messagingLimitTooLow",
    )
  })

  test("shows the manual-integration notice instead of the checklist", async () => {
    await render({
      preflight: {
        ...basePreflight,
        isManual: true,
        hasAppCredential: false,
        callsSubscribed: null,
      },
    })

    expect(container.textContent).toContain(
      "whatsapp.calls.preflight.manualIntegrationNotice",
    )
    expect(container.textContent).not.toContain(
      "whatsapp.calls.preflight.callsNotSubscribed",
    )
  })

  test("shows the Fix button only for a super-admin when calls is not subscribed", async () => {
    await render({
      preflight: { ...basePreflight, callsSubscribed: false },
      isSuperAdmin: true,
    })

    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) =>
        candidate.textContent?.includes("whatsapp.calls.preflight.fixButton"),
    )
    expect(button).toBeDefined()
  })

  test("hides the Fix button for a non-super-admin even when calls is not subscribed", async () => {
    await render({
      preflight: { ...basePreflight, callsSubscribed: false },
      isSuperAdmin: false,
    })

    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) =>
        candidate.textContent?.includes("whatsapp.calls.preflight.fixButton"),
    )
    expect(button).toBeUndefined()
  })

  test("clicking Fix invokes the fix action", async () => {
    await render({
      preflight: { ...basePreflight, callsSubscribed: false },
      isSuperAdmin: true,
    })

    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) =>
        candidate.textContent?.includes("whatsapp.calls.preflight.fixButton"),
    )
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(executeMock).toHaveBeenCalled()
  })
})
