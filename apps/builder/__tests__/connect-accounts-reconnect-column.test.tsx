// @vitest-environment jsdom

import { act, type ReactNode, Suspense } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ConnectAccountsView } from "@/features/ads/components/connect-accounts-view"
import type {
  ConnectAccountsData,
  ConnectAccountsWhatsapp,
} from "@/features/ads/queries/connect-accounts"

vi.mock("next/navigation", () => ({
  usePathname: () => "/space/ws-1/ads/connect-accounts",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: vi.fn(), isPending: false }),
}))

vi.mock("@/features/integration-whatsapp/actions/reconnect.action", () => ({
  reconnectWhatsappAction: vi.fn(),
}))

vi.mock("@/features/ads/components/ad-accounts-section", () => ({
  AdAccountsSection: () => null,
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock("@chatbotx.io/ui/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipContent: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ render }: { render: ReactNode }) => render,
}))

const baseIntegration: ConnectAccountsWhatsapp = {
  id: "iw-1",
  name: "Hung Ban Hang",
  inboxId: "ib-1",
  displayPhoneNumber: "84339426550",
  phoneNumberId: "pn-1",
  wabaId: "1303031825154214",
  hasCapiScope: true,
  capiScopeCheckedAt: new Date("2026-08-11T00:00:00Z"),
  datasetId: "ds-1",
  tokenRefreshError: null,
  needsReconnect: false,
  inbox: { id: "ib-1", name: "Hung Ban Hang" },
}

const whatsappCredentialPublic = {
  clientId: "client-1",
  version: "v23.0",
  configId: "config-1",
  systemUserId: "su-1",
  businessId: "biz-1",
  businessName: "Biz",
  verifyToken: "verify",
}

describe("ConnectAccountsView reconnect column", () => {
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

  async function renderView(data: ConnectAccountsData) {
    const promises = Promise.resolve<[ConnectAccountsData]>([data])
    await act(async () => {
      root.render(
        <Suspense fallback={null}>
          <ConnectAccountsView
            promises={promises}
            selectedAccount=""
            workspaceId="ws-1"
          />
        </Suspense>,
      )
      await promises
    })
  }

  function findReconnectButton(): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent.includes("ads.connectAccounts.reconnect"),
    )
  }

  test("renders a disabled reconnect button when permission is ready", async () => {
    await renderView({
      whatsappIntegrations: [baseIntegration],
      whatsappCredentialPublic,
      facebookAds: {
        connected: false,
        needsReconnect: false,
      },
    })

    const button = findReconnectButton()
    expect(button).toBeDefined()
    expect(button?.disabled).toBe(true)
  })

  test("renders an enabled reconnect button when permission is missing", async () => {
    await renderView({
      whatsappIntegrations: [
        { ...baseIntegration, hasCapiScope: false, needsReconnect: true },
      ],
      whatsappCredentialPublic,
      facebookAds: {
        connected: false,
        needsReconnect: false,
      },
    })

    const button = findReconnectButton()
    expect(button).toBeDefined()
    expect(button?.disabled).toBe(false)
  })
})
