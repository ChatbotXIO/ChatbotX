// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { AnalyticsNav } from "@/features/analytics/components/analytics-nav"

vi.mock("next/navigation", () => ({
  usePathname: () => "/space/ws-1/dashboard/ads/messenger",
  useParams: () => ({ workspaceId: "ws-1" }),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

describe("AnalyticsNav", () => {
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

  test("renders exactly the 3 Ads dashboard links with the right hrefs and labels when all channels are connected", async () => {
    await act(async () => {
      root.render(
        <AnalyticsNav adsChannels={["whatsapp", "messenger", "instagram"]} />,
      )
      await Promise.resolve()
    })

    const links = Array.from(container.querySelectorAll("a"))
    const adsLinks = links.filter((link) =>
      link.getAttribute("href")?.includes("/dashboard/ads/"),
    )

    expect(adsLinks).toHaveLength(3)
    expect(adsLinks.map((link) => link.getAttribute("href"))).toEqual([
      "/space/ws-1/dashboard/ads/whatsapp",
      "/space/ws-1/dashboard/ads/messenger",
      "/space/ws-1/dashboard/ads/instagram",
    ])
    expect(adsLinks.map((link) => link.textContent)).toEqual([
      "ads.dashboardNav.whatsapp",
      "ads.dashboardNav.messenger",
      "ads.dashboardNav.instagram",
    ])
  })

  test("also renders Contacts and Conversations links", async () => {
    await act(async () => {
      root.render(
        <AnalyticsNav adsChannels={["whatsapp", "messenger", "instagram"]} />,
      )
      await Promise.resolve()
    })

    const links = Array.from(container.querySelectorAll("a"))
    expect(
      links.some(
        (link) =>
          link.getAttribute("href") === "/space/ws-1/dashboard/contacts",
      ),
    ).toBe(true)
    expect(
      links.some(
        (link) =>
          link.getAttribute("href") === "/space/ws-1/dashboard/conversations",
      ),
    ).toBe(true)
  })

  test("empty adsChannels renders no Ads dashboard links", async () => {
    await act(async () => {
      root.render(<AnalyticsNav adsChannels={[]} />)
      await Promise.resolve()
    })

    const links = Array.from(container.querySelectorAll("a"))
    const adsLinks = links.filter((link) =>
      link.getAttribute("href")?.includes("/dashboard/ads"),
    )

    expect(adsLinks).toHaveLength(0)
  })

  test("a subset of connected channels renders only those links, in eligible order", async () => {
    await act(async () => {
      root.render(<AnalyticsNav adsChannels={["whatsapp", "messenger"]} />)
      await Promise.resolve()
    })

    const links = Array.from(container.querySelectorAll("a"))
    const adsLinks = links.filter((link) =>
      link.getAttribute("href")?.includes("/dashboard/ads/"),
    )

    expect(adsLinks.map((link) => link.getAttribute("href"))).toEqual([
      "/space/ws-1/dashboard/ads/whatsapp",
      "/space/ws-1/dashboard/ads/messenger",
    ])
  })

  test("marks the Click-to-Messenger Ads link active when on its route", async () => {
    await act(async () => {
      root.render(
        <AnalyticsNav adsChannels={["whatsapp", "messenger", "instagram"]} />,
      )
      await Promise.resolve()
    })

    const links = Array.from(container.querySelectorAll("a"))
    const messengerLink = links.find(
      (link) =>
        link.getAttribute("href") === "/space/ws-1/dashboard/ads/messenger",
    )
    const whatsappLink = links.find(
      (link) =>
        link.getAttribute("href") === "/space/ws-1/dashboard/ads/whatsapp",
    )

    expect(messengerLink?.className).toContain("font-medium")
    expect(whatsappLink?.className).not.toContain("font-medium")
  })
})
