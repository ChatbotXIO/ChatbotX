import type { ReactElement, ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const state = vi.hoisted(() => ({
  env: { NEXT_PUBLIC_STATUS_PAGE_URL: undefined as string | undefined },
  helpItems: [] as { id: string; name: string; url: string; icon?: string }[],
}))

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("@/env", () => ({ env: state.env }))
vi.mock("@/features/tenant/tenant-settings-provider", () => ({
  useTenantSettings: () => ({ helpItems: state.helpItems }),
}))
vi.mock("lucide-react/dynamic", () => ({ DynamicIcon: () => null }))

const passthrough = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
)
const renderProp = ({ render }: { render: ReactElement }) => render

vi.mock("@chatbotx.io/ui/components/ui/sidebar", () => ({
  SidebarMenu: passthrough,
  SidebarMenuItem: passthrough,
  SidebarMenuButton: passthrough,
  useSidebar: () => ({ isMobile: false }),
}))
vi.mock("@chatbotx.io/ui/components/ui/dropdown-menu", () => ({
  DropdownMenu: passthrough,
  DropdownMenuContent: passthrough,
  DropdownMenuTrigger: renderProp,
  DropdownMenuItem: renderProp,
}))

const { NavHelp } = await import("@/components/nav-help")

describe("NavHelp status link", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    state.env.NEXT_PUBLIC_STATUS_PAGE_URL = undefined
    state.helpItems = []
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const statusLink = () =>
    Array.from(container.querySelectorAll("a")).find(
      (link) => link.textContent === "helpMenu.status",
    )

  test("hides the menu when there are no help items and no status URL", () => {
    act(() => root.render(<NavHelp />))

    expect(container.innerHTML).toBe("")
  })

  test("shows only the status link when the URL is set without help items", () => {
    state.env.NEXT_PUBLIC_STATUS_PAGE_URL = "https://status.example.com"

    act(() => root.render(<NavHelp />))

    const link = statusLink()
    expect(link?.getAttribute("href")).toBe("https://status.example.com")
    expect(link?.getAttribute("target")).toBe("_blank")
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer")
  })

  test("omits the status link when the URL is unset", () => {
    state.helpItems = [
      { id: "docs", name: "Docs", url: "https://docs.example.com" },
    ]

    act(() => root.render(<NavHelp />))

    expect(container.textContent).toContain("Docs")
    expect(statusLink()).toBeUndefined()
  })
})
