import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import WorkspacesList from "@/features/workspaces/components/workspaces-list"
import type { HomeTab } from "@/features/workspaces/schema/home-search-params"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

const { mockIsCloud } = vi.hoisted(() => ({ mockIsCloud: vi.fn(() => false) }))

vi.mock("@/env", () => ({
  isCloud: mockIsCloud,
  isCommunity: () => false,
}))

// The component reads only isWorkspaceScheduledForDeletion; the full package
// pulls in the database client, which needs a real server runtime.
vi.mock("@chatbotx.io/business", () => ({
  isWorkspaceScheduledForDeletion: () => false,
}))
vi.mock("@chatbotx.io/business/workspace-lifecycle/predicates", () => ({
  isWorkspaceScheduledForDeletion: () => false,
}))
vi.mock("@/enterprise/features/billing/upgrade-plan-dialog", () => ({
  UpgradePlanButton: () => <button data-testid="upgrade-plan" type="button" />,
}))
vi.mock("@/features/workspaces/components/workspace-status-switch", () => ({
  WorkspaceStatusSwitch: () => null,
}))

const workspace = {
  id: "ws-1",
  name: "My workspace",
  logo: null,
  status: "active",
  endTime: null,
  scheduledDeletionAt: null,
} as unknown as Parameters<typeof WorkspacesList>[0]["workspaces"][number]

let container: HTMLDivElement | null = null
let root: Root | null = null

type RenderOptions = {
  activeTab?: HomeTab
  showTemplatesTab?: boolean
  isAtLimit?: boolean
}

async function renderList(options: RenderOptions = {}): Promise<HTMLElement> {
  const ui = await WorkspacesList({
    user: { name: "Test User", email: "test@example.com", image: null },
    workspaces: [workspace],
    activeTab: options.activeTab,
    showTemplatesTab: options.showTemplatesTab,
    isAtLimit: options.isAtLimit,
    templatesPanel: <div data-testid="templates-panel">catalog</div>,
  })
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(ui)
  })
  return container
}

const tabLink = (el: HTMLElement, tab: HomeTab): HTMLAnchorElement | null =>
  el.querySelector<HTMLAnchorElement>(`#home-tab-${tab}`)

beforeEach(() => {
  mockIsCloud.mockReturnValue(false)
})

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount()
    })
  }
  container?.remove()
  container = null
  root = null
})

describe("WorkspacesList — Templates tab hidden", () => {
  test("keeps today's heading row: an h2 with the count, no tab navigation", async () => {
    const el = await renderList({ showTemplatesTab: false })

    expect(el.querySelector("h2")?.textContent).toBe("billing.usage.workspaces")
    expect(el.querySelector("nav")).toBeNull()
    expect(el.querySelector("section")?.hasAttribute("aria-labelledby")).toBe(
      false,
    )
    expect(el.querySelector('a[href="/space/ws-1"]')).not.toBeNull()
    expect(el.querySelector('[data-testid="templates-panel"]')).toBeNull()
  })

  test("a stale templates tab still shows the workspaces, and the upgrade button", async () => {
    mockIsCloud.mockReturnValue(true)
    const el = await renderList({
      showTemplatesTab: false,
      activeTab: "templates",
      isAtLimit: true,
    })

    expect(el.querySelector("h2")?.textContent).toBe("billing.usage.workspaces")
    expect(el.querySelector('a[href="/space/ws-1"]')).not.toBeNull()
    expect(el.querySelector('[data-testid="templates-panel"]')).toBeNull()
    expect(el.querySelector('[data-testid="upgrade-plan"]')).not.toBeNull()
  })
})

describe("WorkspacesList — Templates tab offered", () => {
  test("on the workspaces tab: two text links, the workspaces one current, the grid shown", async () => {
    const el = await renderList({ showTemplatesTab: true })

    const nav = el.querySelector("nav")
    expect(nav?.getAttribute("aria-label")).toBe("home.tabs.label")
    expect(el.querySelector("h2")).toBeNull()

    const workspaces = tabLink(el, "workspaces")
    const templates = tabLink(el, "templates")
    expect(workspaces?.getAttribute("href")).toBe("/")
    expect(templates?.getAttribute("href")).toBe("/?tab=templates")
    expect(workspaces?.textContent).toBe("billing.usage.workspaces1")
    expect(templates?.textContent).toBe("home.tabs.templates")
    expect(workspaces?.getAttribute("aria-current")).toBe("page")
    expect(templates?.hasAttribute("aria-current")).toBe(false)

    expect(el.querySelector("section")?.getAttribute("aria-labelledby")).toBe(
      "home-tab-workspaces",
    )
    expect(el.querySelector('a[href="/space/ws-1"]')).not.toBeNull()
    expect(el.querySelector('[data-testid="templates-panel"]')).toBeNull()
  })

  test("on the templates tab: the panel replaces the grid and the templates link is current", async () => {
    const el = await renderList({
      showTemplatesTab: true,
      activeTab: "templates",
    })

    expect(tabLink(el, "templates")?.getAttribute("aria-current")).toBe("page")
    expect(tabLink(el, "workspaces")?.hasAttribute("aria-current")).toBe(false)
    expect(el.querySelector("section")?.getAttribute("aria-labelledby")).toBe(
      "home-tab-templates",
    )
    expect(el.querySelector('[data-testid="templates-panel"]')).not.toBeNull()
    expect(el.querySelector('a[href="/space/ws-1"]')).toBeNull()
  })

  test("the tabs are plain text links, not the pill Tabs component", async () => {
    const el = await renderList({ showTemplatesTab: true })

    expect(el.querySelectorAll("nav a")).toHaveLength(2)
    expect(el.querySelector('[role="tablist"], [role="tab"]')).toBeNull()
  })
})

describe("WorkspacesList — upgrade button follows the open tab", () => {
  test("shown on the workspaces tab when the plan limit is reached", async () => {
    mockIsCloud.mockReturnValue(true)
    const el = await renderList({ showTemplatesTab: true, isAtLimit: true })

    expect(el.querySelector('[data-testid="upgrade-plan"]')).not.toBeNull()
  })

  test("hidden on the templates tab, where it is not relevant", async () => {
    mockIsCloud.mockReturnValue(true)
    const el = await renderList({
      showTemplatesTab: true,
      activeTab: "templates",
      isAtLimit: true,
    })

    expect(el.querySelector('[data-testid="upgrade-plan"]')).toBeNull()
  })
})
