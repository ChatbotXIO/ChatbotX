// @vitest-environment jsdom

import React, { act } from "react"
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

vi.mock("@/enterprise/features/billing/upgrade-plan-dialog", () => ({
  UpgradePlanButton: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}))

Object.assign(globalThis, { React })

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
    }> = {},
  ) {
    isCloud.mockReturnValue(props.cloud ?? false)
    const { AccountRail } = await import("../account-rail")
    const element = await AccountRail({
      user: BASE_USER,
      isSuperAdmin: props.isSuperAdmin,
      isPlatformAdmin: props.isPlatformAdmin,
      isPlatformContext: props.isPlatformContext,
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

  it("renders the billing link in both cloud and community editions", async () => {
    await render({ cloud: false })
    expect(findLink("/portal/billing")?.textContent).toContain("Billing")

    act(() => root.unmount())
    container.remove()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)

    await render({ cloud: true })
    expect(findLink("/portal/billing")?.textContent).toContain("Billing")
  })

  it("renders the redeem link only in platform context", async () => {
    await render({ isPlatformContext: true })
    expect(findLink("/portal/redeem")?.textContent).toContain("Redeem")

    act(() => root.unmount())
    container.remove()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)

    await render({ isPlatformContext: false })
    expect(findLink("/portal/redeem")).toBeUndefined()
  })

  it("renders admin iff isSuperAdmin, manage iff cloud && isPlatformAdmin", async () => {
    await render({ isSuperAdmin: true, isPlatformAdmin: true, cloud: false })
    expect(findLink("/admin")?.textContent).toContain("Admin")
    expect(findLink("/manage")).toBeUndefined()

    act(() => root.unmount())
    container.remove()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)

    await render({ isSuperAdmin: true, isPlatformAdmin: true, cloud: true })
    expect(findLink("/admin")?.textContent).toContain("Admin")
    expect(findLink("/manage")?.textContent).toContain("Manage")
  })

  it("still renders the menu block on community edition", async () => {
    await render({ isSuperAdmin: true, cloud: false })

    expect(findLink("/admin")?.textContent).toContain("Admin")
    expect(findLink("/portal/billing")).toBeDefined()
  })

  it("renders exactly one mt-auto element", async () => {
    await render()

    const mtAutoCount = Array.from(container.querySelectorAll("*")).filter(
      (el) => el.classList.contains("mt-auto"),
    ).length
    expect(mtAutoCount).toBe(1)
  })
})
