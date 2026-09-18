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

const optionalCallContextMock = vi.fn<
  () => { startOutbound: typeof startOutboundMock } | null
>(() => ({
  startOutbound: startOutboundMock,
}))
vi.mock(
  "@/features/integration-whatsapp/calling/voip/whatsapp-voip-call-context",
  () => ({
    useOptionalWhatsappVoipCallContext: () => optionalCallContextMock(),
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

  const render = (outboundCallMode: Mode, conversationId = "conversation-1") =>
    act(() => {
      root.render(
        <WhatsappVoipCallButton
          contactName="Ada Lovelace"
          conversationId={conversationId}
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

  const voipMode = (
    overrides: Partial<{
      permissionStatus: "no_permission" | "temporary" | "permanent" | undefined
      unsignedWebhookWarning: boolean
      manualCallsSubscriptionUnverified: boolean
      integrationId: string
    }> = {},
  ) =>
    ({
      mode: "voip" as const,
      permissionStatus: undefined,
      unsignedWebhookWarning: false,
      manualCallsSubscriptionUnverified: false,
      integrationId: "integration-1",
      ...overrides,
    }) satisfies Mode

  test("renders nothing when calling is disabled for this workspace (optional context is null)", async () => {
    optionalCallContextMock.mockReturnValueOnce(null)
    await render(voipMode({ permissionStatus: "permanent" }))
    expect(container.querySelector("button")).toBeNull()
  })

  test("renders the request-permission affordance for voip + no_permission", async () => {
    await render(voipMode({ permissionStatus: "no_permission" }))
    expect(
      container.querySelector('[data-testid="request-permission-dialog"]'),
    ).not.toBeNull()
    expect(startOutboundMock).not.toHaveBeenCalled()
  })

  test("renders the request-permission affordance for voip + undefined permission", async () => {
    await render(voipMode({ permissionStatus: undefined }))
    expect(
      container.querySelector('[data-testid="request-permission-dialog"]'),
    ).not.toBeNull()
  })

  test("renders an enabled call button for voip + temporary/permanent permission", async () => {
    await render(voipMode({ permissionStatus: "permanent" }))
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

  test("two immediate activations of the direct-dial button only start one outbound call", async () => {
    let resolveOutbound: ((value: string) => void) | undefined
    startOutboundMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOutbound = resolve
        }),
    )
    await render(voipMode({ permissionStatus: "permanent" }))
    const button = container.querySelector("button")

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      resolveOutbound?.("dialing")
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(startOutboundMock).toHaveBeenCalledTimes(1)
  })

  test("clicking the enabled call button calls startOutbound with the conversation context", async () => {
    startOutboundMock.mockResolvedValue("dialing")
    await render(voipMode({ permissionStatus: "permanent" }))
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
    await render(voipMode({ permissionStatus: "permanent" }))
    await click()

    expect(document.body.textContent).toContain(
      "whatsapp.calls.outbound.callAlreadyInProgress",
    )
  })

  test("'callAccessDenied' maps to whatsapp.calls.outbound.callAccessDenied", async () => {
    startOutboundMock.mockResolvedValue("callAccessDenied")
    await render(voipMode({ permissionStatus: "permanent" }))
    await click()

    expect(document.body.textContent).toContain(
      "whatsapp.calls.outbound.callAccessDenied",
    )
  })

  test("does not open the AlertDialog on 'occupied' (silent local no-op)", async () => {
    startOutboundMock.mockResolvedValue("occupied")
    await render(voipMode({ permissionStatus: "permanent" }))
    await click()

    expect(container.querySelector('[role="alertdialog"]')).toBeNull()
  })

  test("does not open the AlertDialog on 'cancelled' (silent local no-op)", async () => {
    startOutboundMock.mockResolvedValue("cancelled")
    await render(voipMode({ permissionStatus: "permanent" }))
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
    await render(voipMode({ permissionStatus: "permanent" }))
    await click()

    expect(document.body.textContent).toContain(
      "whatsapp.calls.capability.micPermissionTitle",
    )
  })

  test("micNotFound also uses the mic-permission title", async () => {
    startOutboundMock.mockResolvedValue("micNotFound")
    await render(voipMode({ permissionStatus: "permanent" }))
    await click()

    expect(document.body.textContent).toContain(
      "whatsapp.calls.capability.micPermissionTitle",
    )
  })

  test("a generic dial-failure outcome uses the dial-failure title", async () => {
    startOutboundMock.mockResolvedValue("callAlreadyInProgress")
    await render(voipMode({ permissionStatus: "permanent" }))
    await click()

    expect(document.body.textContent).toContain(
      "whatsapp.calls.capability.dialFailureTitle",
    )
  })

  describe("manual integration call warning", () => {
    const findButtonByText = (text: string) =>
      Array.from(document.querySelectorAll("button")).find((button) =>
        button.textContent?.includes(text),
      )

    const clickCallAnyway = async () => {
      const callAnywayButton = findButtonByText(
        "whatsapp.calls.manualIntegrationCallWarning.callAnyway",
      )
      await act(async () => {
        callAnywayButton?.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        )
        await Promise.resolve()
      })
    }

    test("platform-credential integration: no dialog, dials directly", async () => {
      startOutboundMock.mockResolvedValue("dialing")
      await render(
        voipMode({
          permissionStatus: "permanent",
          unsignedWebhookWarning: false,
          manualCallsSubscriptionUnverified: false,
        }),
      )
      await click()

      expect(startOutboundMock).toHaveBeenCalledWith({
        conversationId: "conversation-1",
        contactInboxId: undefined,
        contactName: "Ada Lovelace",
      })
      expect(document.body.textContent).not.toContain(
        "whatsapp.calls.manualIntegrationCallWarning.title",
      )
    })

    test("manual integration WITH an app secret: dialog shows only the calls-subscription paragraph", async () => {
      startOutboundMock.mockResolvedValue("dialing")
      await render(
        voipMode({
          permissionStatus: "permanent",
          unsignedWebhookWarning: false,
          manualCallsSubscriptionUnverified: true,
        }),
      )
      await click()

      expect(startOutboundMock).not.toHaveBeenCalled()
      expect(document.body.textContent).toContain(
        "whatsapp.calls.manualIntegrationCallWarning.title",
      )
      expect(document.body.textContent).toContain(
        "whatsapp.calls.manualIntegrationCallWarning.callsSubscription",
      )
      expect(document.body.textContent).not.toContain(
        "whatsapp.calls.manualIntegrationCallWarning.unsignedWebhook",
      )
    })

    test("manual integration WITHOUT an app secret: dialog shows both paragraphs", async () => {
      startOutboundMock.mockResolvedValue("dialing")
      await render(
        voipMode({
          permissionStatus: "permanent",
          unsignedWebhookWarning: true,
          manualCallsSubscriptionUnverified: true,
        }),
      )
      await click()

      expect(startOutboundMock).not.toHaveBeenCalled()
      expect(document.body.textContent).toContain(
        "whatsapp.calls.manualIntegrationCallWarning.callsSubscription",
      )
      expect(document.body.textContent).toContain(
        "whatsapp.calls.manualIntegrationCallWarning.unsignedWebhook",
      )
    })

    test("Cancel does not dial", async () => {
      startOutboundMock.mockResolvedValue("dialing")
      await render(
        voipMode({
          permissionStatus: "permanent",
          unsignedWebhookWarning: true,
          manualCallsSubscriptionUnverified: true,
        }),
      )
      await click()

      const dialog = container.ownerDocument.querySelector(
        '[role="alertdialog"]',
      )
      expect(dialog).not.toBeNull()
      const cancelButton = findButtonByText("actions.cancel")
      expect(cancelButton).not.toBeUndefined()

      await act(async () => {
        cancelButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
        await Promise.resolve()
      })

      expect(startOutboundMock).not.toHaveBeenCalled()
    })

    test("two immediate activations of 'Call anyway' only start one outbound call", async () => {
      let resolveOutbound: ((value: string) => void) | undefined
      startOutboundMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveOutbound = resolve
          }),
      )
      await render(
        voipMode({
          permissionStatus: "permanent",
          unsignedWebhookWarning: true,
          manualCallsSubscriptionUnverified: true,
        }),
      )
      await click()

      const callAnywayButton = findButtonByText(
        "whatsapp.calls.manualIntegrationCallWarning.callAnyway",
      )
      await act(async () => {
        callAnywayButton?.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        )
        callAnywayButton?.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        )
        resolveOutbound?.("dialing")
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(startOutboundMock).toHaveBeenCalledTimes(1)
    })

    test("'Call anyway' closes the dialog immediately, before the dial resolves", async () => {
      let resolveOutbound: ((value: string) => void) | undefined
      startOutboundMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveOutbound = resolve
          }),
      )
      await render(
        voipMode({
          permissionStatus: "permanent",
          unsignedWebhookWarning: true,
          manualCallsSubscriptionUnverified: true,
        }),
      )
      await click()
      expect(isWarningDialogOpen()).toBe(true)

      await clickCallAnyway()

      // Dial still in flight, but the warning no longer covers the call panel.
      expect(startOutboundMock).toHaveBeenCalledTimes(1)
      expect(isWarningDialogOpen()).toBe(false)

      await act(async () => {
        resolveOutbound?.("dialing")
        await Promise.resolve()
      })
    })

    test("'Call anyway' proceeds with the dial", async () => {
      startOutboundMock.mockResolvedValue("dialing")
      await render(
        voipMode({
          permissionStatus: "permanent",
          unsignedWebhookWarning: true,
          manualCallsSubscriptionUnverified: true,
        }),
      )
      await click()
      expect(startOutboundMock).not.toHaveBeenCalled()

      await clickCallAnyway()

      expect(startOutboundMock).toHaveBeenCalledWith({
        conversationId: "conversation-1",
        contactInboxId: undefined,
        contactName: "Ada Lovelace",
      })
    })

    test("does not re-show the warning after 'Call anyway' was already acknowledged for the same integration", async () => {
      startOutboundMock.mockResolvedValue("dialing")
      await render(
        voipMode({
          permissionStatus: "permanent",
          unsignedWebhookWarning: true,
          manualCallsSubscriptionUnverified: true,
        }),
      )
      await click()
      await clickCallAnyway()
      startOutboundMock.mockClear()

      await click()

      expect(startOutboundMock).toHaveBeenCalled()
    })

    test("acknowledgement is NOT reused for a different integration", async () => {
      startOutboundMock.mockResolvedValue("dialing")
      await render(
        voipMode({
          permissionStatus: "permanent",
          unsignedWebhookWarning: true,
          manualCallsSubscriptionUnverified: true,
          integrationId: "integration-1",
        }),
      )
      await click()
      await clickCallAnyway()
      startOutboundMock.mockClear()

      // Same mounted component, different integration/conversation — the
      // acknowledgement must not carry over.
      await render(
        voipMode({
          permissionStatus: "permanent",
          unsignedWebhookWarning: true,
          manualCallsSubscriptionUnverified: true,
          integrationId: "integration-2",
        }),
      )
      await click()

      expect(startOutboundMock).not.toHaveBeenCalled()
      expect(document.body.textContent).toContain(
        "whatsapp.calls.manualIntegrationCallWarning.title",
      )
    })

    // The alert-dialog primitive keeps a closed dialog's markup mounted
    // during its exit transition (no "transitionend" in jsdom), so a closed
    // dialog is asserted via the absence of `data-open` on its content,
    // rather than the element (or its text) being removed from the DOM.
    const isWarningDialogOpen = () =>
      document.querySelector(
        '[data-slot="alert-dialog-content"][data-open]',
      ) !== null

    test("dialog closes without dialing when outboundCallMode refetches onto a platform integration", async () => {
      startOutboundMock.mockResolvedValue("dialing")
      await render(
        voipMode({
          permissionStatus: "permanent",
          unsignedWebhookWarning: true,
          manualCallsSubscriptionUnverified: true,
        }),
      )
      await click()
      expect(isWarningDialogOpen()).toBe(true)

      // Navigated to another conversation on a platform-credential
      // integration: the mode query refetches onto a non-manual mode.
      await render(voipMode({ permissionStatus: "permanent" }))

      expect(isWarningDialogOpen()).toBe(false)
      expect(startOutboundMock).not.toHaveBeenCalled()
    })

    test("dialog closes without dialing when outboundCallMode refetches onto a different manual integrationId, and reopens fresh for the new integration", async () => {
      startOutboundMock.mockResolvedValue("dialing")
      await render(
        voipMode({
          permissionStatus: "permanent",
          unsignedWebhookWarning: true,
          manualCallsSubscriptionUnverified: true,
          integrationId: "integration-1",
        }),
      )
      await click()
      expect(isWarningDialogOpen()).toBe(true)

      // Navigated to a conversation on a different manual integration.
      await render(
        voipMode({
          permissionStatus: "permanent",
          unsignedWebhookWarning: true,
          manualCallsSubscriptionUnverified: true,
          integrationId: "integration-2",
        }),
      )

      expect(isWarningDialogOpen()).toBe(false)
      expect(startOutboundMock).not.toHaveBeenCalled()

      // Clicking again shows the warning for the new integration, not a
      // stale acknowledgement or a no-op.
      await click()
      expect(isWarningDialogOpen()).toBe(true)
      expect(startOutboundMock).not.toHaveBeenCalled()
    })

    test("dialog closes without dialing when the conversation changes on the SAME manual integration", async () => {
      startOutboundMock.mockResolvedValue("dialing")
      const manual = voipMode({
        permissionStatus: "permanent",
        unsignedWebhookWarning: true,
        manualCallsSubscriptionUnverified: true,
        integrationId: "integration-1",
      })
      await render(manual, "conversation-1")
      await click()
      expect(isWarningDialogOpen()).toBe(true)

      // Navigated to another contact on the same number while the dialog was open.
      await render(manual, "conversation-2")

      expect(isWarningDialogOpen()).toBe(false)
      await clickCallAnyway()
      expect(startOutboundMock).not.toHaveBeenCalled()
    })

    test.each([
      ["a platform integration", voipMode({ permissionStatus: "permanent" })],
      [
        "a different manual integration",
        voipMode({
          permissionStatus: "permanent",
          unsignedWebhookWarning: true,
          manualCallsSubscriptionUnverified: true,
          integrationId: "integration-2",
        }),
      ],
    ])("navigating away to %s and back never re-opens the old dialog without a new click", async (_label, otherMode) => {
      startOutboundMock.mockResolvedValue("dialing")
      const manual = voipMode({
        permissionStatus: "permanent",
        unsignedWebhookWarning: true,
        manualCallsSubscriptionUnverified: true,
        integrationId: "integration-1",
      })
      await render(manual)
      await click()
      expect(isWarningDialogOpen()).toBe(true)

      await render(otherMode)
      await render(manual)

      expect(isWarningDialogOpen()).toBe(false)
      expect(startOutboundMock).not.toHaveBeenCalled()
    })

    test("navigating to another conversation on the same number and back never re-opens the old dialog", async () => {
      startOutboundMock.mockResolvedValue("dialing")
      const manual = voipMode({
        permissionStatus: "permanent",
        unsignedWebhookWarning: true,
        manualCallsSubscriptionUnverified: true,
      })
      await render(manual, "conversation-1")
      await click()
      expect(isWarningDialogOpen()).toBe(true)

      await render(manual, "conversation-2")
      await render(manual, "conversation-1")

      expect(isWarningDialogOpen()).toBe(false)
    })

    test("the dial lock is released when startOutbound rejects, so a later 'Call anyway' dials again", async () => {
      startOutboundMock.mockRejectedValueOnce(new Error("boom"))
      startOutboundMock.mockResolvedValue("dialing")
      await render(
        voipMode({
          permissionStatus: "permanent",
          unsignedWebhookWarning: true,
          manualCallsSubscriptionUnverified: true,
        }),
      )
      await click()
      await clickCallAnyway()
      await act(async () => {
        await Promise.resolve()
      })
      expect(startOutboundMock).toHaveBeenCalledTimes(1)

      // Acknowledged for this integration, so the next click dials directly.
      await click()
      expect(startOutboundMock).toHaveBeenCalledTimes(2)
    })

    test("does not render a settings link (manual integration settings has no App Secret field)", async () => {
      startOutboundMock.mockResolvedValue("dialing")
      await render(
        voipMode({
          permissionStatus: "permanent",
          unsignedWebhookWarning: true,
          manualCallsSubscriptionUnverified: true,
          integrationId: "integration-42",
        }),
      )
      await click()

      expect(document.querySelector('a[href*="integration-42"]')).toBeNull()
    })
  })
})
