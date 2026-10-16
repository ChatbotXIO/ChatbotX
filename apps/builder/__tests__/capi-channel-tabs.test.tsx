// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

type CapturedTabProps = {
  channel: string
  connection: string
  integration: {
    id: string
    datasetId: string | null
    capiTestEventCode: string | null
  }
  disconnectAction: unknown
  connectCustomAction: unknown
  connectSlot: React.ReactNode
  unsupportedContent?: React.ReactNode
  footnote?: React.ReactNode
}

const mocks = vi.hoisted(() => ({
  tabProps: {} as unknown,
  execute: vi.fn(),
  bindMessengerConnect: vi.fn(),
  bindInstagramConnect: vi.fn(),
  useActionCalls: [] as unknown[],
  whatsappButtonProps: {} as unknown,
}))

const captured = () => mocks.tabProps as CapturedTabProps

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "ws-1" }))
vi.mock("next-safe-action/hooks", () => ({
  useAction: (action: unknown) => {
    mocks.useActionCalls.push(action)
    return { execute: mocks.execute, isPending: false }
  },
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode
    href: string
  }) => <a href={href}>{children}</a>,
}))
vi.mock("@/features/meta-conversions/components/capi-connection-tab", () => ({
  CapiConnectionTab: (props: CapturedTabProps) => {
    mocks.tabProps = props
    return (
      <div>
        {props.connectSlot}
        {props.unsupportedContent}
        {props.footnote}
      </div>
    )
  },
}))

// Server actions: stubbed so this unit test does not load the business graph.
const disconnect = { name: "disconnect" }
const connectCustom = { name: "connectCustom" }
vi.mock("@/features/integration-messenger/actions/connect-capi.action", () => ({
  connectMessengerCapiAction: { bind: mocks.bindMessengerConnect },
}))
vi.mock("@/features/integration-instagram/actions/connect-capi.action", () => ({
  connectInstagramCapiAction: { bind: mocks.bindInstagramConnect },
}))
vi.mock(
  "@/features/integration-messenger/actions/connect-custom-capi.action",
  () => ({
    connectMessengerCustomCapiAction: connectCustom,
  }),
)
vi.mock(
  "@/features/integration-instagram/actions/connect-custom-capi.action",
  () => ({
    connectInstagramCustomCapiAction: connectCustom,
  }),
)
vi.mock(
  "@/features/integration-whatsapp/actions/connect-custom-capi.action",
  () => ({
    connectWhatsappCustomCapiAction: connectCustom,
  }),
)
vi.mock(
  "@/features/integration-messenger/actions/disconnect-capi.action",
  () => ({
    disconnectMessengerCapiAction: disconnect,
  }),
)
vi.mock(
  "@/features/integration-instagram/actions/disconnect-capi.action",
  () => ({
    disconnectInstagramCapiAction: disconnect,
  }),
)
vi.mock(
  "@/features/integration-whatsapp/actions/disconnect-capi.action",
  () => ({
    disconnectWhatsappCapiAction: disconnect,
  }),
)
vi.mock(
  "@/features/integration-whatsapp/components/whatsapp-capi-connect-button",
  () => ({
    WhatsappCapiConnectButton: (props: unknown) => {
      mocks.whatsappButtonProps = props
      return <button type="button">whatsapp-connect</button>
    },
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

describe("channel Conversions API tabs", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    vi.clearAllMocks()
    mocks.useActionCalls.length = 0
    mocks.bindMessengerConnect.mockReturnValue("bound-messenger-connect")
    mocks.bindInstagramConnect.mockReturnValue("bound-instagram-connect")
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
  const buttons = () => Array.from(container.querySelectorAll("button"))

  describe("MessengerCapiTab", () => {
    const integrationMessenger = {
      id: "im-1",
      datasetId: "ds-1",
      capiTestEventCode: "TEST1",
    }

    test("hands the shared tab its channel, connection, integration and actions", () => {
      render(
        <MessengerCapiTab
          connection="connected"
          integrationMessenger={integrationMessenger}
        />,
      )

      expect(captured()).toMatchObject({
        channel: "messenger",
        connection: "connected",
        integration: integrationMessenger,
        disconnectAction: disconnect,
        connectCustomAction: connectCustom,
      })
    })

    test("its Connect button starts the dedicated OAuth of this page", () => {
      render(
        <MessengerCapiTab
          connection="notConnected"
          integrationMessenger={integrationMessenger}
        />,
      )

      expect(mocks.bindMessengerConnect).toHaveBeenCalledWith(
        null,
        "ws-1",
        "im-1",
      )
      expect(mocks.useActionCalls).toContain("bound-messenger-connect")
      const connect = buttons().find(
        (button) => button.textContent === "metaConversions.connect.button",
      )
      act(() => {
        connect?.click()
      })
      expect(mocks.execute).toHaveBeenCalledWith()
    })
  })

  describe("InstagramCapiTab", () => {
    const base = {
      id: "ig-1",
      datasetId: null,
      capiTestEventCode: null,
    }

    test("a Facebook-login account connects like Messenger", () => {
      render(
        <InstagramCapiTab
          connection="notConnected"
          integrationInstagram={{ ...base, type: "facebook" }}
        />,
      )

      expect(captured()).toMatchObject({
        channel: "instagram",
        connection: "notConnected",
      })
      expect(captured().unsupportedContent).toBeUndefined()
      expect(mocks.bindInstagramConnect).toHaveBeenCalledWith(
        null,
        "ws-1",
        "ig-1",
      )
    })

    test("an Instagram Business Login account is unsupported and invited to connect through Facebook", () => {
      render(
        <InstagramCapiTab
          connection="notConnected"
          integrationInstagram={{ ...base, type: "instagram" }}
        />,
      )

      expect(captured().unsupportedContent).toBeDefined()
      expect(container.textContent).toContain(
        "metaConversions.unsupportedExplanation",
      )
      expect(container.querySelector("a")?.getAttribute("href")).toBe(
        "/channels/create?channel=instagram-facebook&workspaceId=ws-1",
      )
    })
  })

  describe("WhatsappCapiTab", () => {
    const settings = {
      clientId: "app-1",
      version: "v25.0",
      configId: "signup",
      capiConfigId: "capi",
      systemUserId: "su",
      businessName: "Acme",
      verifyToken: "verify",
    }
    const integrationWhatsapp = {
      id: "iw-1",
      datasetId: "ds-1",
      capiTestEventCode: null,
      isCoexist: true,
    }

    test("connects through the Embedded Signup popup with the platform settings", () => {
      render(
        <WhatsappCapiTab
          connection="notConnected"
          integrationWhatsapp={integrationWhatsapp}
          oauthCallbackUrl="https://broker.example.test/integrations/whatsapp/callback"
          settings={settings}
        />,
      )

      expect(captured()).toMatchObject({
        channel: "whatsapp",
        connection: "notConnected",
        integration: {
          id: "iw-1",
          datasetId: "ds-1",
          capiTestEventCode: null,
        },
      })
      expect(mocks.whatsappButtonProps).toMatchObject({
        integrationWhatsappId: "iw-1",
        workspaceId: "ws-1",
        settings,
        isCoexist: true,
        oauthCallbackUrl:
          "https://broker.example.test/integrations/whatsapp/callback",
      })
    })

    test("keeps the click-to-WhatsApp note", () => {
      render(
        <WhatsappCapiTab
          connection="connected"
          integrationWhatsapp={integrationWhatsapp}
          oauthCallbackUrl="https://broker.example.test/integrations/whatsapp/callback"
          settings={null}
        />,
      )

      expect(container.textContent).toContain(
        "metaConversions.flowStep.whatsappNote",
      )
    })
  })
})
