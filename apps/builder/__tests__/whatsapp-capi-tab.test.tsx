// @vitest-environment jsdom

import type { WhatsappCredentialPublic } from "@chatbotx.io/database/partials"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { WhatsappCapiTab } from "@/features/integration-whatsapp/components/whatsapp-capi-tab"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "ws-1",
}))

// The server actions are imported at module load and forwarded to the child
// cards as props; stub the modules so this unit test does not pull the
// business/database graph they depend on.
vi.mock(
  "@/features/integration-whatsapp/actions/connect-custom-capi.action",
  () => ({ connectWhatsappCustomCapiAction: vi.fn() }),
)
vi.mock(
  "@/features/integration-whatsapp/actions/disconnect-capi.action",
  () => ({
    disconnectWhatsappCapiAction: vi.fn(),
  }),
)
vi.mock(
  "@/features/integration-whatsapp/actions/provision-capi-dataset.action",
  () => ({ provisionWhatsappCapiDatasetAction: vi.fn() }),
)
vi.mock(
  "@/features/integration-whatsapp/actions/set-capi-dataset.action",
  () => ({
    setWhatsappCapiDatasetAction: vi.fn(),
  }),
)

// The child surfaces have their own tests; here we assert only which one the
// tab renders per connection state, so each is stubbed to a plain marker.
vi.mock("@/features/meta-conversions/components/capi-method-chooser", () => ({
  CapiMethodChooser: () => <div>method-chooser</div>,
}))
vi.mock("@/features/meta-conversions/components/capi-connected-card", () => ({
  CapiConnectedCard: ({ notice }: { notice?: string }) => (
    <div>connected-card{notice ? `:${notice}` : ""}</div>
  ),
}))
vi.mock("@/features/meta-conversions/components/capi-test-event-card", () => ({
  CapiTestEventCard: () => <div>test-event-card</div>,
}))
vi.mock(
  "@/features/integration-whatsapp/components/whatsapp-reconnect-button",
  () => ({
    WhatsappReconnectButton: () => (
      <button type="button">reconnect-button</button>
    ),
  }),
)

type TabProps = Parameters<typeof WhatsappCapiTab>[0]

const baseIntegration: TabProps["integrationWhatsapp"] = {
  id: "iw-1",
  name: "Store",
  displayPhoneNumber: "84339426550",
  wabaId: "1303031825154214",
  hasCapiScope: true,
  isCoexist: false,
  datasetId: "ds-1",
  capiTestEventCode: null,
}

const whatsappCredentialPublic: WhatsappCredentialPublic = {
  clientId: "client-1",
  version: "v23.0",
  configId: "config-1",
  systemUserId: "su-1",
  businessId: "biz-1",
  businessName: "Biz",
  verifyToken: "verify",
}

describe("WhatsappCapiTab", () => {
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

  function renderTab(overrides: Partial<TabProps> = {}) {
    const props: TabProps = {
      integrationWhatsapp: baseIntegration,
      hasManualCapiAccessToken: false,
      capiDisconnected: false,
      credentialAvailable: true,
      whatsappCredentialPublic,
      oauthCallbackUrl: "https://broker.test/integrations/whatsapp/callback",
      ...overrides,
    }
    act(() => {
      root.render(<WhatsappCapiTab {...props} />)
    })
  }

  test("renders the method chooser and no reconnect when disconnected", () => {
    renderTab({ capiDisconnected: true })

    expect(container.textContent).toContain("method-chooser")
    expect(container.textContent).not.toContain("reconnect-button")
    expect(container.textContent).not.toContain("test-event-card")
  })

  test("offers reconnect instead of the test card while awaiting the Meta scope", () => {
    renderTab({
      integrationWhatsapp: { ...baseIntegration, hasCapiScope: false },
    })

    expect(container.textContent).toContain("connected-card")
    expect(container.textContent).toContain("reconnect-button")
    expect(container.textContent).not.toContain("test-event-card")
  })

  test("shows the test card and no reconnect once the scope is granted", () => {
    renderTab()

    expect(container.textContent).toContain("connected-card")
    expect(container.textContent).toContain("test-event-card")
    expect(container.textContent).not.toContain("reconnect-button")
  })
})
