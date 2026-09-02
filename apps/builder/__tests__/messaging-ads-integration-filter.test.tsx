// @vitest-environment jsdom

import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { MessagingAdsIntegrationFilter } from "@/features/ads-campaign/components/messaging-ads-integration-filter"
import type { MessagingAdsToolIntegration } from "@/features/ads-campaign/queries/tool-integrations"

const navigation = vi.hoisted(() => ({
  pathname: "/space/ws1/messaging-ads/whatsapp",
  push: vi.fn(),
  searchParams: new URLSearchParams("foo=bar&integration=a"),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
  useSearchParams: () => navigation.searchParams,
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@chatbotx.io/ui/components/ui/select", () => ({
  Select: ({
    items,
    onValueChange,
    value,
  }: {
    items: Array<{ label: string; value: string }>
    onValueChange: (value: string) => void
    value: string
    children: ReactNode
  }) => (
    <select
      aria-label="ads.conversionEvents.selectIntegration"
      onChange={(event) => onValueChange(event.currentTarget.value)}
      value={value}
    >
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => children,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <div data-value={value}>{children}</div>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => children,
  SelectValue: () => null,
}))

const integrations: MessagingAdsToolIntegration[] = [
  { id: "a", name: "Account A" },
  { id: "b", name: "Account B" },
]

describe("MessagingAdsIntegrationFilter", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    navigation.push.mockClear()
    navigation.pathname = "/space/ws1/messaging-ads/whatsapp"
    navigation.searchParams = new URLSearchParams("foo=bar&integration=a")
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

  function renderFilter(selectedIntegrationId = "a") {
    act(() => {
      root.render(
        <MessagingAdsIntegrationFilter
          integrations={integrations}
          selectedIntegrationId={selectedIntegrationId}
        />,
      )
    })
  }

  test("exposes the select with the selectIntegration aria-label", () => {
    renderFilter()

    const select = container.querySelector<HTMLSelectElement>("select")

    expect(select).not.toBeNull()
    expect(select?.getAttribute("aria-label")).toBe(
      "ads.conversionEvents.selectIntegration",
    )
  })

  test("shows the selected integration's label as the current value", () => {
    renderFilter("b")

    const select = container.querySelector<HTMLSelectElement>("select")

    expect(select?.value).toBe("b")
    expect(container.textContent).toContain("Account B")
  })

  test("renders every integration as an option and no 'all accounts' option", () => {
    renderFilter()

    const options = Array.from(
      container.querySelectorAll<HTMLOptionElement>("option"),
    )

    expect(options.map((option) => option.value)).toEqual(["a", "b"])
    expect(container.textContent).not.toContain("all")
  })

  test("choosing another integration pushes the URL with integration replaced and other params preserved", () => {
    renderFilter("a")

    act(() => {
      const select = container.querySelector<HTMLSelectElement>("select")
      if (!select) {
        throw new Error("integration select not rendered")
      }
      select.value = "b"
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })

    expect(navigation.push).toHaveBeenCalledWith(
      "/space/ws1/messaging-ads/whatsapp?foo=bar&integration=b",
    )
  })
})
