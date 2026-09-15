import type React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { WhatsappVoipCallButton } from "@/features/integration-whatsapp/calling/voip/whatsapp-voip-call-button"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "workspace-1",
}))

const { startOutboundMock } = vi.hoisted(() => ({
  startOutboundMock: vi.fn(),
}))

vi.mock(
  "@/features/integration-whatsapp/calling/voip/whatsapp-voip-call-context",
  () => ({
    useWhatsappVoipCallContext: () => ({ startOutbound: startOutboundMock }),
  }),
)

vi.mock(
  "@/features/integration-whatsapp/calling/request-call-permission-dialog",
  () => ({
    RequestCallPermissionDialog: ({
      children,
    }: {
      children: React.ReactNode
    }) => <div data-testid="request-permission-dialog">{children}</div>,
  }),
)

describe("WhatsappVoipCallButton", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  type Mode = Parameters<typeof WhatsappVoipCallButton>[0]["outboundCallMode"]

  const render = (outboundCallMode: Mode) =>
    act(() => {
      root.render(
        <WhatsappVoipCallButton
          contactName="Ada Lovelace"
          conversationId="conversation-1"
          outboundCallMode={outboundCallMode}
        />,
      )
    })

  const click = () => {
    const button = container.querySelector("button")
    return act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })
  }

  test("renders the request-permission affordance for voip + no_permission", async () => {
    await render({ mode: "voip", permissionStatus: "no_permission" })
    expect(
      container.querySelector('[data-testid="request-permission-dialog"]'),
    ).not.toBeNull()
    expect(startOutboundMock).not.toHaveBeenCalled()
  })

  test("renders the request-permission affordance for voip + undefined permission", async () => {
    await render({ mode: "voip", permissionStatus: undefined })
    expect(
      container.querySelector('[data-testid="request-permission-dialog"]'),
    ).not.toBeNull()
  })

  test("renders an enabled call button for voip + temporary/permanent permission", async () => {
    await render({ mode: "voip", permissionStatus: "permanent" })
    expect(
      container.querySelector('[data-testid="request-permission-dialog"]'),
    ).toBeNull()
    expect(container.querySelector("button")).not.toBeNull()
  })

  test("renders a disabled button while the mode is still resolving (undefined)", async () => {
    await render(undefined)
    const button = container.querySelector("button")
    expect(button).not.toBeNull()
    expect(button?.disabled).toBe(true)
    expect(
      container.querySelector('[data-testid="request-permission-dialog"]'),
    ).toBeNull()
  })

  test("clicking while resolving is a no-op — a click only acts on a resolved permission state (no more 'random' asks)", async () => {
    startOutboundMock.mockResolvedValue("dialing")
    await render(undefined)
    await click()

    expect(startOutboundMock).not.toHaveBeenCalled()
  })

  test("clicking the enabled call button calls startOutbound with the conversation context", async () => {
    startOutboundMock.mockResolvedValue("dialing")
    await render({ mode: "voip", permissionStatus: "permanent" })
    await click()

    expect(startOutboundMock).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      contactInboxId: undefined,
      contactName: "Ada Lovelace",
    })
    expect(
      document.querySelector('[data-slot="alert-dialog-content"]'),
    ).toBeNull()
  })

  test("opens the capability AlertDialog on a mode: none click, instead of dialing", async () => {
    await render({ mode: "none", reason: "callingNotEnabled" })
    await click()

    expect(startOutboundMock).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain(
      "whatsapp.calls.capability.enableCalling",
    )
  })

  test("maps a webhookNotSubscribed reason to the reconnect-channel message", async () => {
    await render({ mode: "none", reason: "webhookNotSubscribed" })
    await click()

    expect(document.body.textContent).toContain(
      "whatsapp.calls.capability.reconnectChannel",
    )
  })

  test("opens the AlertDialog on a non-dialing/occupied/cancelled startOutbound outcome", async () => {
    startOutboundMock.mockResolvedValue("callAlreadyInProgress")
    await render({ mode: "voip", permissionStatus: "permanent" })
    await click()

    expect(document.body.textContent).toContain(
      "whatsapp.calls.outbound.callAlreadyInProgress",
    )
  })

  test("does not open the AlertDialog on 'occupied' (silent local no-op)", async () => {
    startOutboundMock.mockResolvedValue("occupied")
    await render({ mode: "voip", permissionStatus: "permanent" })
    await click()

    expect(container.querySelector('[role="alertdialog"]')).toBeNull()
  })

  test("does not open the AlertDialog on 'cancelled' (silent local no-op)", async () => {
    startOutboundMock.mockResolvedValue("cancelled")
    await render({ mode: "voip", permissionStatus: "permanent" })
    await click()

    expect(container.querySelector('[role="alertdialog"]')).toBeNull()
  })

  test("a mode:none capability alert uses the eligibility title", async () => {
    await render({ mode: "none", reason: "callingNotEnabled" })
    await click()

    expect(document.body.textContent).toContain(
      "whatsapp.calls.capability.title",
    )
  })

  test("a mic permission outcome uses the mic-permission title, not the generic eligibility title", async () => {
    startOutboundMock.mockResolvedValue("micPermissionDenied")
    await render({ mode: "voip", permissionStatus: "permanent" })
    await click()

    expect(document.body.textContent).toContain(
      "whatsapp.calls.capability.micPermissionTitle",
    )
  })

  test("micNotFound also uses the mic-permission title", async () => {
    startOutboundMock.mockResolvedValue("micNotFound")
    await render({ mode: "voip", permissionStatus: "permanent" })
    await click()

    expect(document.body.textContent).toContain(
      "whatsapp.calls.capability.micPermissionTitle",
    )
  })

  test("a generic dial-failure outcome uses the dial-failure title", async () => {
    startOutboundMock.mockResolvedValue("callAlreadyInProgress")
    await render({ mode: "voip", permissionStatus: "permanent" })
    await click()

    expect(document.body.textContent).toContain(
      "whatsapp.calls.capability.dialFailureTitle",
    )
  })
})
