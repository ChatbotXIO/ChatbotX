// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { MessagingAdsToolTabs } from "@/features/ads-campaign/components/messaging-ads-tool-tabs"

const navigation = vi.hoisted(() => ({
  pathname: "/space/ws1/messaging-ads/whatsapp",
}))

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "ws1",
}))

describe("MessagingAdsToolTabs", () => {
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

  test("renders WhatsApp, Messenger, Instagram tabs in that order with query-less hrefs", () => {
    navigation.pathname = "/space/ws1/messaging-ads/whatsapp"

    act(() => {
      root.render(<MessagingAdsToolTabs />)
    })

    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>("a"))

    expect(links.map((link) => link.textContent)).toEqual([
      "fields.whatsapp.label",
      "fields.messenger.label",
      "fields.instagram.label",
    ])
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/space/ws1/messaging-ads/whatsapp",
      "/space/ws1/messaging-ads/messenger",
      "/space/ws1/messaging-ads/instagram",
    ])
  })

  test("marks the tab matching the current pathname's last segment active", () => {
    navigation.pathname = "/space/ws1/messaging-ads/messenger"

    act(() => {
      root.render(<MessagingAdsToolTabs />)
    })

    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>("a"))
    const activeLinks = links.filter((link) =>
      link.className.includes("border-neutral-700"),
    )

    expect(activeLinks).toHaveLength(1)
    expect(activeLinks[0]?.textContent).toBe("fields.messenger.label")
    expect(activeLinks[0]?.getAttribute("href")).toBe(
      "/space/ws1/messaging-ads/messenger",
    )
  })

  test("no tab is active when the pathname's last segment matches no channel", () => {
    navigation.pathname = "/space/ws1/messaging-ads"

    act(() => {
      root.render(<MessagingAdsToolTabs />)
    })

    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>("a"))
    const activeLinks = links.filter((link) =>
      link.className.includes("border-neutral-700"),
    )

    expect(activeLinks).toHaveLength(0)
  })
})
