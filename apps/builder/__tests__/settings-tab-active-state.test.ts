// @vitest-environment node

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// SettingsTab used to compute the active tab from the *last* path segment.
// That works for top-level routes (/settings/channels) but breaks for any
// tab with nested sub-routes (/settings/channels/messenger,
// /settings/integrations/<slug>) — the last segment is the sub-route slug,
// which matches no tab, so the tab loses its active/highlighted state.
// ---------------------------------------------------------------------------

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: mockUsePathname,
  useParams: () => ({ workspaceId: "ws-1" }),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

type CapturedTab = { label: string; href: string; isActive: boolean }

const { mockAppTab } = vi.hoisted(() => ({
  mockAppTab: vi.fn(),
}))

vi.mock("@/components/app-tab", () => ({
  AppTab: (props: { tabs: CapturedTab[] }) => {
    mockAppTab(props.tabs)
    return null
  },
}))

const { SettingsTab } = await import(
  "../src/app/space/[workspaceId]/(settings)/settings/tab"
)

function activeTabValue(tabs: CapturedTab[]): string | undefined {
  const active = tabs.find((tab) => tab.isActive)
  return active ? active.href.split("/").at(-1) : undefined
}

describe("SettingsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("marks the channels tab active on the top-level channels route", () => {
    mockUsePathname.mockReturnValue("/space/ws-1/settings/channels")

    renderToStaticMarkup(createElement(SettingsTab, {}))

    const tabs = mockAppTab.mock.calls[0][0] as CapturedTab[]
    expect(activeTabValue(tabs)).toBe("channels")
  })

  test("marks the channels tab active on a nested channel sub-route", () => {
    mockUsePathname.mockReturnValue("/space/ws-1/settings/channels/messenger")

    renderToStaticMarkup(createElement(SettingsTab, {}))

    const tabs = mockAppTab.mock.calls[0][0] as CapturedTab[]
    expect(activeTabValue(tabs)).toBe("channels")
  })

  test("marks the integrations tab active on a nested integration sub-route", () => {
    mockUsePathname.mockReturnValue(
      "/space/ws-1/settings/integrations/google-sheets",
    )

    renderToStaticMarkup(createElement(SettingsTab, {}))

    const tabs = mockAppTab.mock.calls[0][0] as CapturedTab[]
    expect(activeTabValue(tabs)).toBe("integrations")
  })
})
