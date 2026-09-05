// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { AdAccountsSection } from "@/features/integration-facebook-ads/components/ad-accounts-section"

const actionState = vi.hoisted(() => ({
  execute: vi.fn(),
}))

const listAdAccounts = vi.hoisted(() => vi.fn())

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: actionState.execute, isPending: false }),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    integrationFacebookAdsAPI: {
      listAdAccounts,
    },
  },
}))

vi.mock("@/features/integration-facebook-ads/actions/connect.action", () => ({
  connectFacebookAds: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

type FacebookAdsStatus = {
  connected: boolean
  needsReconnect: boolean
}

describe("AdAccountsSection", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    Object.assign(window, { PointerEvent: MouseEvent })
    listAdAccounts.mockReset()
    listAdAccounts.mockResolvedValue({ data: [] })
    actionState.execute.mockClear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
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

  async function renderSection(facebookAds: FacebookAdsStatus) {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <AdAccountsSection facebookAds={facebookAds} workspaceId="ws-1" />
        </QueryClientProvider>,
      )
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  test("shows the connect state without rendering an ad accounts table", async () => {
    await renderSection({ connected: false, needsReconnect: false })

    expect(container.textContent).toContain(
      "ads.connectAccounts.adAccountsNotConnected",
    )
    expect(container.textContent).toContain(
      "ads.connectAccounts.connectAdAccount",
    )
    expect(container.querySelector("table")).toBeNull()
  })

  test("shows the reconnect state without the connect CTA", async () => {
    await renderSection({ connected: true, needsReconnect: true })

    expect(container.textContent).toContain(
      "ads.connectAccounts.adAccountsReconnectBanner",
    )
    expect(container.textContent).not.toContain(
      "ads.connectAccounts.connectAdAccount",
    )
  })

  test("shows connected ad accounts from the query without the reconnect banner", async () => {
    listAdAccounts.mockResolvedValue({
      data: [{ id: "act_1", name: "Acme Ads" }],
    })

    await renderSection({ connected: true, needsReconnect: false })

    expect(container.textContent).toContain("Acme Ads")
    expect(container.textContent).toContain("act_1")
    expect(container.textContent).not.toContain(
      "ads.connectAccounts.adAccountsReconnectBanner",
    )
  })

  test("shows the empty state when connected without ad accounts", async () => {
    listAdAccounts.mockResolvedValue({ data: [] })

    await renderSection({ connected: true, needsReconnect: false })

    expect(container.textContent).toContain(
      "ads.connectAccounts.adAccountsEmpty",
    )
  })
})
