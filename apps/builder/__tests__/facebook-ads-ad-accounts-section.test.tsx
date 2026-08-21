// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { AdAccountsSection } from "@/features/integration-facebook-ads/components/ad-accounts-section"

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

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: actionState.execute, isPending: false }),
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

  function renderSection(facebookAds: FacebookAdsStatus) {
    act(() => {
      root.render(
        <AdAccountsSection facebookAds={facebookAds} workspaceId="ws-1" />,
      )
    })
  }

  test("shows the connect state without rendering an ad accounts table", () => {
    renderSection({ connected: false, needsReconnect: false })

    expect(container.textContent).toContain(
      "ads.connectAccounts.adAccountsNotConnected",
    )
    expect(container.textContent).toContain(
      "ads.connectAccounts.connectAdAccount",
    )
    expect(container.querySelector("table")).toBeNull()
  })

  test("shows the reconnect state without the connect CTA", () => {
    renderSection({ connected: true, needsReconnect: true })

    expect(container.textContent).toContain(
      "ads.connectAccounts.adAccountsReconnectBanner",
    )
    expect(container.textContent).not.toContain(
      "ads.connectAccounts.connectAdAccount",
    )
  })

  test("shows connected ad accounts from SWR without the reconnect banner", () => {
    swrState.data = { data: [{ id: "act_1", name: "Acme Ads" }] }

    renderSection({ connected: true, needsReconnect: false })

    expect(container.textContent).toContain("Acme Ads")
    expect(container.textContent).toContain("act_1")
    expect(container.textContent).not.toContain(
      "ads.connectAccounts.adAccountsReconnectBanner",
    )
  })

  test("shows the empty state when connected without ad accounts", () => {
    swrState.data = { data: [] }

    renderSection({ connected: true, needsReconnect: false })

    expect(container.textContent).toContain(
      "ads.connectAccounts.adAccountsEmpty",
    )
  })
})
