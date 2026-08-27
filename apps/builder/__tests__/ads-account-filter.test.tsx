// @vitest-environment jsdom

import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { AdsAccountFilter } from "@/features/ads/components/ads-account-filter"
import type { AdsAnalyticsSearchParams } from "@/features/ads/schemas/analytics"

vi.mock("next/navigation", () => ({
  usePathname: () => "/space/ws-1/dashboard/ads/messenger",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@chatbotx.io/ui/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => children,
  SelectContent: ({ children }: { children: ReactNode }) => children,
  SelectItem: ({ children }: { children: ReactNode }) => (
    <div data-select-item>{children}</div>
  ),
  SelectTrigger: ({ children, id }: { children: ReactNode; id?: string }) => (
    <div data-select-trigger={id}>{children}</div>
  ),
  SelectValue: () => null,
}))

const baseRange = {
  from: "2026-08-01",
  to: "2026-08-10",
  account: "",
  channelAccount: "",
  adAccount: "",
  channel: "messenger",
} as AdsAnalyticsSearchParams

describe("AdsAccountFilter — integration/account select only, no channel select", () => {
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

  test("renders no channel select — the channel select trigger id is absent", async () => {
    await act(async () => {
      root.render(
        <AdsAccountFilter
          channelIntegrations={[{ id: "msg-1", name: "My Page" }]}
          range={baseRange}
          selectedIntegrationId="msg-1"
        />,
      )
      await Promise.resolve()
    })

    expect(
      container.querySelector('[data-select-trigger="ads-analytics-channel"]'),
    ).toBeNull()
    expect(container.textContent).not.toContain(
      "ads.analytics.channelFilter.allChannels",
    )
    expect(container.textContent).not.toContain(
      "ads.analytics.channelFilter.label",
    )
  })

  test("renders the integration/account select with the current channel's integrations", async () => {
    await act(async () => {
      root.render(
        <AdsAccountFilter
          channelIntegrations={[{ id: "msg-1", name: "My Page" }]}
          range={baseRange}
          selectedIntegrationId="msg-1"
        />,
      )
      await Promise.resolve()
    })

    expect(
      container.querySelector(
        '[data-select-trigger="ads-analytics-channel-account"]',
      ),
    ).not.toBeNull()
    expect(container.textContent).toContain("My Page")
    expect(container.textContent).toContain(
      "ads.analytics.channelFilter.allAccounts",
    )
  })

  test("shows the integration select even with an empty integrations list (no 'all channels' hide branch anymore)", async () => {
    await act(async () => {
      root.render(
        <AdsAccountFilter
          channelIntegrations={[]}
          range={baseRange}
          selectedIntegrationId={null}
        />,
      )
      await Promise.resolve()
    })

    expect(
      container.querySelector(
        '[data-select-trigger="ads-analytics-channel-account"]',
      ),
    ).not.toBeNull()
  })
})
