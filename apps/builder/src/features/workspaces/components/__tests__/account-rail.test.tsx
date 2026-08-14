// @vitest-environment jsdom

import type React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest"

const translations: Record<string, string> = {
  "actions.admin": "Admin",
  "actions.manage": "Manage",
  "actions.billing": "Billing",
  "actions.redeem": "Redeem",
  "actions.upgradePlan": "Upgrade plan",
  "billing.plan.free": "Free",
  "billing.plan.currentLabel": "Current plan",
}

function translate(key: string, values?: { plan?: string }): string {
  if (key === "billing.plan.label") {
    return `Plan: ${values?.plan ?? ""}`
  }
  return translations[key] ?? key
}

vi.mock("next-intl/server", () => ({
  getTranslations: async () => translate,
}))

vi.mock("@/features/tenant/utils", () => ({
  getTenantSettings: async () => ({ storageUrl: "https://cdn.example.test" }),
}))

const isCloud: Mock<() => boolean> = vi.fn(() => false)
vi.mock("@/env", () => ({
  isCloud: () => isCloud(),
}))

vi.mock("@/features/auth/sign-out", () => ({
  SignOut: () => <button type="button">Sign out</button>,
}))

vi.mock("../edit-profile-dialog", () => ({
  EditProfileDialog: () => null,
}))

// Severs the server-action import chain (refresh action → @/lib/safe-action →
// @chatbotx.io/business → database/client), which otherwise touches a
// server-only env var at import time and crashes the whole file before any
// test body runs.
vi.mock("../refresh-all-channel-tokens-button", () => ({
  RefreshAllChannelTokensButton: () => null,
}))

vi.mock("@/enterprise/features/billing/upgrade-plan-dialog", () => ({
  UpgradePlanButton: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}))

// Hoisted so the heavy first import of the component graph happens during
// collection, not inside the first test's timeout budget under parallel load.
const { AccountRail } = await import("../account-rail")

const BASE_USER = { name: "Jane Doe", email: "jane@example.test", image: null }

describe("account rail", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    isCloud.mockReset()
    isCloud.mockReturnValue(false)
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  async function render(
    props: Partial<{
      isSuperAdmin: boolean
      isPlatformAdmin: boolean
      isPlatformContext: boolean
      cloud: boolean
      planName: string | null
    }> = {},
  ) {
    isCloud.mockReturnValue(props.cloud ?? false)
    const element = await AccountRail({
      user: BASE_USER,
      isSuperAdmin: props.isSuperAdmin,
      isPlatformAdmin: props.isPlatformAdmin,
      isPlatformContext: props.isPlatformContext,
      planName: props.planName,
    })
    act(() => {
      root.render(element)
    })
  }

  function findLink(href: string) {
    return Array.from(container.querySelectorAll("a")).find(
      (a) => a.getAttribute("href") === href,
    )
  }

  function planNameText() {
    return container.textContent ?? ""
  }

  it("hides the billing link on community edition", async () => {
    await render({ cloud: false })
    expect(findLink("/portal/billing")).toBeUndefined()
  })

  it("renders the billing link on cloud edition", async () => {
    await render({ cloud: true })
    expect(findLink("/portal/billing")?.textContent).toContain("Billing")
  })

  it("renders the redeem link in platform context on cloud edition", async () => {
    await render({ cloud: true, isPlatformContext: true })
    expect(findLink("/portal/redeem")?.textContent).toContain("Redeem")
  })

  it("hides the redeem link outside platform context", async () => {
    await render({ cloud: true, isPlatformContext: false })
    expect(findLink("/portal/redeem")).toBeUndefined()
  })

  it("hides the redeem link on community edition even in platform context", async () => {
    await render({ cloud: false, isPlatformContext: true })
    expect(findLink("/portal/redeem")).toBeUndefined()
  })

  it("renders admin but hides manage on community edition", async () => {
    await render({ isSuperAdmin: true, isPlatformAdmin: true, cloud: false })
    expect(findLink("/admin")?.textContent).toContain("Admin")
    expect(findLink("/manage")).toBeUndefined()
  })

  it("renders admin and manage on cloud edition", async () => {
    await render({ isSuperAdmin: true, isPlatformAdmin: true, cloud: true })
    expect(findLink("/admin")?.textContent).toContain("Admin")
    expect(findLink("/manage")?.textContent).toContain("Manage")
  })

  it("still renders the menu block on community edition", async () => {
    await render({ isSuperAdmin: true, cloud: false })

    expect(findLink("/admin")?.textContent).toContain("Admin")
    expect(findLink("/portal/billing")).toBeUndefined()
  })

  it("omits the menu divider when no menu items render on community edition", async () => {
    await render({ cloud: false })

    const menu = container.querySelector("#account-rail-menu")
    expect(menu?.classList.contains("border-t")).toBe(false)
    expect(menu?.classList.contains("pt-4")).toBe(false)
  })

  it("keeps the menu divider when the admin link renders on community edition", async () => {
    await render({ isSuperAdmin: true, cloud: false })

    const menu = container.querySelector("#account-rail-menu")
    expect(menu?.classList.contains("border-t")).toBe(true)
  })

  it("renders exactly one mt-auto element", async () => {
    await render()

    const mtAutoCount = Array.from(container.querySelectorAll("*")).filter(
      (el) => el.classList.contains("mt-auto"),
    ).length
    expect(mtAutoCount).toBe(1)
  })

  it("renders the current plan label and name on cloud edition", async () => {
    await render({ cloud: true, planName: "Pro" })

    const text = planNameText()
    expect(text).toContain("Current plan")
    expect(text).toContain("Pro")
  })

  it("falls back to the free plan label when no plan name is set", async () => {
    await render({ cloud: true, planName: null })

    const text = planNameText()
    expect(text).toContain("Current plan")
    expect(text).toContain("Free")
  })
})
