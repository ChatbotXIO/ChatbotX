// @vitest-environment jsdom

import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ChannelFilter } from "@/features/ads/components/channel-filter"
import type { AdsAnalyticsSearchParams } from "@/features/ads/schema/analytics"

vi.mock("next/navigation", () => ({
  usePathname: () => "/space/ws-1/dashboard/ads",
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
} as Omit<AdsAnalyticsSearchParams, "channel">

describe("ChannelFilter — 'All channels' option and integration-select visibility", () => {
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

  test("renders an 'All channels' option via the special label branch, not a fake tabs.all key", async () => {
    await act(async () => {
      root.render(
        <ChannelFilter
          channelIntegrations={[]}
          range={{ ...baseRange, channel: "all" }}
          selectedIntegrationId={null}
        />,
      )
      await Promise.resolve()
    })

    expect(container.textContent).toContain(
      "ads.analytics.channelFilter.allChannels",
    )
    expect(container.textContent).not.toContain("ads.conversionEvents.tabs.all")
  })

  test("hides the integration select entirely when channel is 'all'", async () => {
    await act(async () => {
      root.render(
        <ChannelFilter
          channelIntegrations={[{ id: "msg-1", name: "My Page" }]}
          range={{ ...baseRange, channel: "all" }}
          selectedIntegrationId={null}
        />,
      )
      await Promise.resolve()
    })

    expect(
      container.querySelector(
        '[data-select-trigger="ads-analytics-channel-account"]',
      ),
    ).toBeNull()
  })

  test("shows the integration select for a concrete channel", async () => {
    await act(async () => {
      root.render(
        <ChannelFilter
          channelIntegrations={[{ id: "msg-1", name: "My Page" }]}
          range={{ ...baseRange, channel: "messenger" }}
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
  })
})
