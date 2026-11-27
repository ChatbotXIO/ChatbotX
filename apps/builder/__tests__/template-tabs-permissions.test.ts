import type { ReactElement } from "react"
import { describe, expect, test, vi } from "vitest"

vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}))
vi.mock("@/components/app-tab", () => ({ AppTab: () => null }))
vi.mock("@chatbotx.io/business", async () => {
  const permissions = await import(
    "../../../packages/business/src/template/permissions"
  )
  return {
    canViewTemplateInstalls: permissions.canViewTemplateInstalls,
    TEMPLATE_MANAGE_PERMISSION: permissions.TEMPLATE_MANAGE_PERMISSION,
  }
})

const { TemplatesTabs } = await import(
  "@/features/templates/components/templates-tabs"
)

type Tab = { label: string; href: string; isActive: boolean }

const tabsFor = async (
  permissions: Record<string, boolean>,
  active: "mine" | "installed" = "installed",
): Promise<Tab[]> => {
  const element = (await TemplatesTabs({
    workspaceId: "ws-1",
    active,
    permissions,
  })) as ReactElement<{ tabs: Tab[] }>
  return element.props.tabs
}

const none = {
  flows: false,
  contacts: false,
  analytics: false,
  broadcast: false,
  ecommerce: false,
  superAdmin: false,
}

describe("templates tabs per member permissions", () => {
  test("a flows-only member sees My templates and Installed", async () => {
    const tabs = await tabsFor({ ...none, flows: true }, "mine")
    expect(tabs.map((tab) => tab.href)).toEqual([
      "/space/ws-1/templates",
      "/space/ws-1/templates/installs",
    ])
    expect(tabs.find((tab) => tab.isActive)?.label).toBe("mine")
  })

  test("an ecommerce-only member sees only Installed", async () => {
    const tabs = await tabsFor({ ...none, ecommerce: true })
    expect(tabs).toEqual([
      {
        label: "installed",
        href: "/space/ws-1/templates/installs",
        isActive: true,
      },
    ])
  })

  test("a member with no template-related permission sees no tab", async () => {
    expect(await tabsFor({ ...none, contacts: true })).toEqual([])
  })

  test("a super admin sees both tabs", async () => {
    const tabs = await tabsFor({ ...none, superAdmin: true })
    expect(tabs).toHaveLength(2)
  })
})
