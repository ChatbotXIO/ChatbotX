// @vitest-environment jsdom

import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { AdsAccountSwitcher } from "@/features/ads/components/ads-account-switcher"

const navigation = vi.hoisted(() => ({
  pathname: "/space/ws-1/ads/analytics",
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({
    replace: navigation.replace,
    refresh: vi.fn(),
  }),
  useSearchParams: () => navigation.searchParams,
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

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
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
      aria-label="account"
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

const integrations = [
  {
    id: "iw-1",
    name: "Primary",
    displayPhoneNumber: "+12025550101",
    hasCapiScope: true,
  },
  {
    id: "iw-2",
    name: "Secondary",
    displayPhoneNumber: "+12025550102",
    hasCapiScope: true,
  },
]

describe("AdsAccountSwitcher", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    navigation.replace.mockClear()
    navigation.searchParams = new URLSearchParams()
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

  function renderSwitcher() {
    act(() => {
      root.render(
        <AdsAccountSwitcher
          integrations={integrations}
          whatsappCredentialPublic={null}
          workspaceId="ws-1"
        />,
      )
    })
  }

  test("resolves a stale account param to the first integration", () => {
    navigation.searchParams = new URLSearchParams(
      "account=missing&from=2026-08-01",
    )

    renderSwitcher()

    expect(container.querySelector<HTMLSelectElement>("select")?.value).toBe(
      "iw-1",
    )
  })

  test("writes the account param while preserving other params", () => {
    navigation.searchParams = new URLSearchParams(
      "from=2026-08-01&to=2026-08-10",
    )
    renderSwitcher()

    act(() => {
      const select = container.querySelector<HTMLSelectElement>("select")
      if (!select) {
        throw new Error("account select not rendered")
      }
      select.value = "iw-2"
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })

    expect(navigation.replace).toHaveBeenCalledWith(
      "/space/ws-1/ads/analytics?from=2026-08-01&to=2026-08-10&account=iw-2",
      { scroll: false },
    )
  })
})
