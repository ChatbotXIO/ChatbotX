import type { ComponentProps, ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: ReactNode
    href: string
    className?: string
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const { AppTab } = await import("@/components/app-tab")

type Tab = ComponentProps<typeof AppTab>["tabs"][number]

const TABS: Tab[] = [
  { label: "General", href: "/settings/general", isActive: true },
  { label: "Channels", href: "/settings/channels", isActive: false },
  { label: "Integrations", href: "/settings/integrations", isActive: false },
  { label: "Admins", href: "/settings/admins", isActive: false },
  { label: "Inbox teams", href: "/settings/inbox-teams", isActive: false },
]

describe("AppTab", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (tabs: Tab[]) => {
    act(() => {
      root.render(<AppTab tabs={tabs} />)
    })
  }

  const strip = () => {
    const anchor = container.querySelector("a")
    return anchor?.parentElement ?? null
  }

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

  test("renders every tab", () => {
    render(TABS)

    const labels = Array.from(container.querySelectorAll("a")).map(
      (anchor) => anchor.textContent,
    )
    expect(labels).toEqual([
      "General",
      "Channels",
      "Integrations",
      "Admins",
      "Inbox teams",
    ])
  })

  test("scrolls the strip instead of overflowing the page", () => {
    render(TABS)

    const className = strip()?.className ?? ""
    expect(className).toContain("overflow-x-auto")
    expect(className).toContain("flex-nowrap")
  })

  test("keeps each tab at its natural width so labels never squeeze", () => {
    render(TABS)

    for (const anchor of Array.from(container.querySelectorAll("a"))) {
      expect(anchor.className).toContain("shrink-0")
      expect(anchor.className).toContain("whitespace-nowrap")
    }
  })

  test("tightens padding on small screens and restores it from md up", () => {
    render(TABS)

    const className = strip()?.className ?? ""
    expect(className).toContain("px-4")
    expect(className).toContain("md:px-8")
    expect(className).toContain("gap-4")
    expect(className).toContain("md:gap-8")
  })

  test("marks the active tab", () => {
    render(TABS)

    const active = Array.from(container.querySelectorAll("a")).find((anchor) =>
      anchor.className.includes("border-neutral-700"),
    )
    expect(active?.textContent).toBe("General")
  })

  test("renders a disabled tab as a non-link", () => {
    render([
      { label: "General", href: "/settings/general", isActive: true },
      {
        label: "Locked",
        href: "/settings/locked",
        isActive: false,
        disabled: true,
      },
    ])

    const anchors = Array.from(container.querySelectorAll("a")).map(
      (anchor) => anchor.textContent,
    )
    expect(anchors).toEqual(["General"])
    expect(container.textContent).toContain("Locked")
  })
})
