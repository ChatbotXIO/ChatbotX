// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

/**
 * The per-layer tests mock the layer below them, so a prop-wiring mismatch between
 * a channel tab, the shared tab and its cards could slip through. This renders the
 * real chain and mocks only the leaves: translations, routing, server actions and
 * the Test events dialog.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "ws-1" }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode
    href: string
  }) => <a href={href}>{children}</a>,
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: vi.fn(), isPending: false }),
}))

// One stub for every server action these tabs import: only `.bind` is used here.
const actionModule = vi.hoisted(() => {
  const action = { bind: () => "bound" }
  return {
    connectMessengerCapiAction: action,
    connectMessengerCustomCapiAction: action,
    disconnectMessengerCapiAction: action,
    connectInstagramCapiAction: action,
    connectInstagramCustomCapiAction: action,
    disconnectInstagramCapiAction: action,
    connectWhatsappCapiAction: action,
    connectWhatsappCustomCapiAction: action,
    disconnectWhatsappCapiAction: action,
    saveCapiTestEventCodeAction: action,
    sendCapiTestEventAction: action,
  }
})
vi.mock(
  "@/features/integration-messenger/actions/connect-capi.action",
  () => actionModule,
)
vi.mock(
  "@/features/integration-messenger/actions/connect-custom-capi.action",
  () => actionModule,
)
vi.mock(
  "@/features/integration-messenger/actions/disconnect-capi.action",
  () => actionModule,
)
vi.mock(
  "@/features/integration-instagram/actions/connect-capi.action",
  () => actionModule,
)
vi.mock(
  "@/features/integration-instagram/actions/connect-custom-capi.action",
  () => actionModule,
)
vi.mock(
  "@/features/integration-instagram/actions/disconnect-capi.action",
  () => actionModule,
)
vi.mock(
  "@/features/integration-whatsapp/actions/connect-capi.action",
  () => actionModule,
)
vi.mock(
  "@/features/integration-whatsapp/actions/connect-custom-capi.action",
  () => actionModule,
)
vi.mock(
  "@/features/integration-whatsapp/actions/disconnect-capi.action",
  () => actionModule,
)
vi.mock(
  "@/features/meta-conversions/actions/save-capi-test-event-code.action",
  () => actionModule,
)
vi.mock(
  "@/features/meta-conversions/actions/send-capi-test-event.action",
  () => actionModule,
)

vi.mock(
  "@/features/meta-conversions/components/capi-test-event-dialog",
  () => ({
    CapiTestEventDialog: () => null,
  }),
)

const { MessengerCapiTab } = await import(
  "@/features/integration-messenger/components/messenger-capi-tab"
)
const { InstagramCapiTab } = await import(
  "@/features/integration-instagram/components/instagram-capi-tab"
)
const { WhatsappCapiTab } = await import(
  "@/features/integration-whatsapp/components/whatsapp-capi-tab"
)

const CONNECT_BUTTON = "metaConversions.connect.button"
const DISCONNECT_BUTTON = "metaConversions.disconnect"

describe("Conversions API tabs, rendered end to end", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  const render = (element: React.ReactElement) =>
    act(() => {
      root.render(element)
    })
  const buttonTexts = () =>
    Array.from(container.querySelectorAll("button")).map(
      (button) => button.textContent,
    )

  describe("Messenger", () => {
    const integrationMessenger = {
      id: "im-1",
      datasetId: "ds-1",
      capiTestEventCode: null,
    }

    test("not connected: Connect and the custom option, no connected card", () => {
      render(
        <MessengerCapiTab
          connection="notConnected"
          integrationMessenger={integrationMessenger}
        />,
      )

      expect(buttonTexts()).toContain(CONNECT_BUTTON)
      expect(buttonTexts()).toContain("metaConversions.methods.custom.start")
      expect(buttonTexts()).not.toContain(DISCONNECT_BUTTON)
      expect(container.textContent).toContain(
        "metaConversions.status.notConnected",
      )
    })

    test("connected: the dataset, Disconnect and Test events, and no Connect", () => {
      render(
        <MessengerCapiTab
          connection="connected"
          integrationMessenger={integrationMessenger}
        />,
      )

      expect(container.textContent).toContain("ds-1")
      expect(buttonTexts()).toContain(DISCONNECT_BUTTON)
      expect(buttonTexts()).not.toContain(CONNECT_BUTTON)
      expect(container.textContent).toContain("metaConversions.status.ready")
      expect(container.textContent).toContain("testEvents.")
    })
  })

  describe("Instagram", () => {
    const base = { id: "ig-1", datasetId: "ds-2", capiTestEventCode: null }

    test("a Facebook-login account connects like Messenger", () => {
      render(
        <InstagramCapiTab
          connection="notConnected"
          integrationInstagram={{ ...base, type: "facebook" }}
        />,
      )

      expect(buttonTexts()).toContain(CONNECT_BUTTON)
    })

    test("a Business Login account shows only the explanation, even when its row looks connected", () => {
      render(
        <InstagramCapiTab
          connection="connected"
          integrationInstagram={{ ...base, type: "instagram" }}
        />,
      )

      expect(container.textContent).toContain(
        "metaConversions.unsupportedExplanation",
      )
      expect(container.textContent).toContain(
        "metaConversions.status.unsupported",
      )
      expect(buttonTexts()).not.toContain(CONNECT_BUTTON)
      expect(buttonTexts()).not.toContain(DISCONNECT_BUTTON)
    })
  })

  describe("WhatsApp", () => {
    const integrationWhatsapp = {
      id: "iw-1",
      datasetId: "ds-3",
      capiTestEventCode: null,
      isCoexist: false,
    }
    const props = {
      oauthCallbackUrl:
        "https://broker.example.test/integrations/whatsapp/callback",
      settings: null,
    }

    test("not connected: the Embedded Signup Connect button and the click-to-WhatsApp note", () => {
      render(
        <WhatsappCapiTab
          connection="notConnected"
          integrationWhatsapp={integrationWhatsapp}
          {...props}
        />,
      )

      expect(buttonTexts()).toContain(CONNECT_BUTTON)
      expect(container.textContent).toContain(
        "metaConversions.flowStep.whatsappNote",
      )
    })

    test("connected: the dataset and Disconnect", () => {
      render(
        <WhatsappCapiTab
          connection="connected"
          integrationWhatsapp={integrationWhatsapp}
          {...props}
        />,
      )

      expect(container.textContent).toContain("ds-3")
      expect(buttonTexts()).toContain(DISCONNECT_BUTTON)
      expect(buttonTexts()).not.toContain(CONNECT_BUTTON)
    })
  })
})
