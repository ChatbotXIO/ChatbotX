// @vitest-environment jsdom

import { act, type ReactNode, Suspense } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ConnectAccountsView } from "@/features/ads/components/connect-accounts-view"
import type { ConnectAccountsData } from "@/features/ads/queries/connect-accounts"

const swrState = vi.hoisted(() => ({
  data: undefined as
    | { data: Array<{ id: string; name?: string | null }> }
    | undefined,
  error: undefined as Error | undefined,
  isLoading: false,
}))
const actionState = vi.hoisted(() => ({
  execute: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/space/ws-1/ads/connect-accounts",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: actionState.execute, isPending: false }),
}))

vi.mock("@/features/integration-whatsapp/actions/reconnect.action", () => ({
  reconnectWhatsappAction: vi.fn(),
}))

vi.mock("swr", () => ({
  default: () => ({
    data: swrState.data,
    error: swrState.error,
    isLoading: swrState.isLoading,
  }),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    integrationFacebookAdsAPI: {
      listAdAccounts: vi.fn(),
    },
  },
}))

vi.mock(
  "@/features/integration-facebook-ads/actions/connect-from-ads.action",
  () => ({
    connectFacebookAdsFromAdsAction: vi.fn(),
  }),
)

vi.mock("@/features/ads/queries/connect-accounts", () => ({}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock("@chatbotx.io/ui/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipContent: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ render }: { render: ReactNode }) => render,
}))

const baseData = {
  whatsappIntegrations: [],
  whatsappCredentialPublic: null,
  facebookAds: {
    connected: false,
    needsReconnect: false,
  },
} satisfies ConnectAccountsData

describe("ConnectAccountsView Meta ad accounts section", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    Object.assign(window, { PointerEvent: MouseEvent })
    swrState.data = undefined
    swrState.error = undefined
    swrState.isLoading = false
    actionState.execute.mockClear()
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

  test("shows the connect state without rendering an ad accounts table", async () => {
    await renderView(baseData)

    expect(container.textContent).toContain(
      "ads.connectAccounts.adAccountsNotConnected",
    )
    expect(container.textContent).toContain(
      "ads.connectAccounts.connectAdAccount",
    )
    expect(container.querySelector("table")).toBeNull()
  })

  test("shows the reconnect state without the connect CTA", async () => {
    await renderView({
      ...baseData,
      facebookAds: {
        connected: true,
        needsReconnect: true,
      },
    })

    expect(container.textContent).toContain(
      "ads.connectAccounts.adAccountsReconnectBanner",
    )
    expect(container.textContent).not.toContain(
      "ads.connectAccounts.connectAdAccount",
    )
  })

  test("shows connected ad accounts from SWR without the reconnect banner", async () => {
    swrState.data = { data: [{ id: "act_1", name: "Acme Ads" }] }

    await renderView({
      ...baseData,
      facebookAds: {
        connected: true,
        needsReconnect: false,
      },
    })

    expect(container.textContent).toContain("Acme Ads")
    expect(container.textContent).toContain("act_1")
    expect(container.textContent).not.toContain(
      "ads.connectAccounts.adAccountsReconnectBanner",
    )
  })

  test("shows the empty state when connected without ad accounts", async () => {
    swrState.data = { data: [] }

    await renderView({
      ...baseData,
      facebookAds: {
        connected: true,
        needsReconnect: false,
      },
    })

    expect(container.textContent).toContain(
      "ads.connectAccounts.adAccountsEmpty",
    )
  })
})
