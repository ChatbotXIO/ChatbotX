// @vitest-environment jsdom

import { CreditCardIcon, HomeIcon } from "lucide-react"
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  AccountRail,
  type AccountRailItem,
  type AccountRailUser,
} from "../account-rail"

Object.assign(globalThis, { React })

const user: AccountRailUser = {
  displayName: "Jane Doe",
  email: "jane@example.test",
  avatarUrl: "",
}

const baseItems: AccountRailItem[] = [
  { key: "internal", label: "Billing", href: "/billing", icon: CreditCardIcon },
  {
    key: "external",
    label: "Dashboard",
    href: "https://example.test",
    icon: HomeIcon,
    external: true,
  },
]

describe("AccountRail", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function render(props: Partial<Parameters<typeof AccountRail>[0]> = {}) {
    act(() => {
      root.render(
        <AccountRail
          footer={<button type="button">Sign out</button>}
          items={baseItems}
          user={user}
          {...props}
        />,
      )
    })
  }

  function findLink(href: string) {
    return Array.from(container.querySelectorAll("a")).find(
      (a) => a.getAttribute("href") === href,
    )
  }

  it("renders a bare anchor for external items and a next/link anchor for internal items", () => {
    render()

    const external = findLink("https://example.test")
    const internal = findLink("/billing")
    expect(external?.textContent).toContain("Dashboard")
    expect(internal?.textContent).toContain("Billing")
  })

  it("renders exactly one mt-auto element", () => {
    render()

    const mtAutoCount = container.querySelectorAll(".mt-auto").length
    expect(mtAutoCount).toBe(1)
  })

  it("does not add a second mt-auto when planBlock is present", () => {
    render({ planBlock: <div>Plan: Pro</div> })

    const mtAutoCount = container.querySelectorAll(".mt-auto").length
    expect(mtAutoCount).toBe(1)
  })

  function findHeader() {
    // The header is the flex row that directly wraps the Avatar element.
    return container
      .querySelector('[data-slot="avatar"]')
      ?.closest(".flex.items-center.gap-3")
  }

  it("renders headerAction when provided and makes the header relative", () => {
    render({ headerAction: <button type="button">Edit</button> })

    expect(container.textContent).toContain("Edit")
    expect(findHeader()?.classList.contains("relative")).toBe(true)
  })

  it("omits the relative class on the header when headerAction is absent", () => {
    render()

    expect(findHeader()?.classList.contains("relative")).toBe(false)
  })

  it("renders no plan section when planBlock is omitted", () => {
    render()

    expect(container.textContent).not.toContain("Plan:")
  })

  it("renders planBlock content when provided", () => {
    render({ planBlock: <div>Plan: Pro</div> })

    expect(container.textContent).toContain("Plan: Pro")
  })

  it("renders footer content inside the footer wrapper", () => {
    render()

    expect(container.textContent).toContain("Sign out")
  })

  it("derives initials from displayName", () => {
    render()

    expect(container.textContent).toContain("JA")
  })
})
