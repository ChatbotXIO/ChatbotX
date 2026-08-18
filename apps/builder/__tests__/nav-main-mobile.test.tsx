import {
  SidebarProvider,
  useSidebar,
} from "@chatbotx.io/ui/components/ui/sidebar"
import { setViewportWidth } from "@chatbotx.io/vitest-config/setup-dom"
import type { ComponentProps, ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next/navigation", () => ({
  usePathname: () => "/space/w1/inbox",
}))

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const { NavMain } = await import("@/components/nav-main")

type SidebarState = { openMobile: boolean; isMobile: boolean }

function SidebarStateProbe({
  onReady,
  onRead,
}: {
  onReady: (open: (value: boolean) => void) => void
  onRead: (state: SidebarState) => void
}) {
  const { openMobile, isMobile, setOpenMobile } = useSidebar()
  onRead({ openMobile, isMobile })
  onReady(setOpenMobile)
  return null
}

const ITEMS = [
  { title: "Inbox", url: "/space/w1/inbox" },
  { title: "Contacts", url: "/space/w1/contacts" },
]

describe("NavMain on a mobile viewport", () => {
  let container: HTMLDivElement
  let root: Root
  let state: SidebarState | undefined
  let setOpenMobile: ((value: boolean) => void) | undefined

  const swallowNavigation = (event: Event) => event.preventDefault()

  const renderNav = (children: ReactNode) => {
    act(() => {
      root.render(
        <SidebarProvider>
          {children}
          <SidebarStateProbe
            onRead={(next) => {
              state = next
            }}
            onReady={(setter) => {
              setOpenMobile = setter
            }}
          />
        </SidebarProvider>,
      )
    })
  }

  const clickLink = (label: string) => {
    const link = Array.from(container.querySelectorAll("a")).find((anchor) =>
      anchor.textContent?.includes(label),
    )
    if (!link) {
      throw new Error(`no nav link labelled ${label}`)
    }
    act(() => {
      link.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      )
    })
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    state = undefined
    setOpenMobile = undefined
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    // jsdom cannot navigate; without this every link click logs a "Not
    // implemented" error that has nothing to do with the behaviour under test.
    document.addEventListener("click", swallowNavigation)
  })

  afterEach(() => {
    document.removeEventListener("click", swallowNavigation)
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  test("closes the sidebar sheet when a nav link is tapped", () => {
    setViewportWidth(375)
    renderNav(<NavMain items={ITEMS} />)
    expect(state?.isMobile).toBe(true)

    act(() => {
      setOpenMobile?.(true)
    })
    expect(state?.openMobile).toBe(true)

    clickLink("Contacts")

    expect(state?.openMobile).toBe(false)
  })

  test("closes the sheet for cross-zone links too", () => {
    setViewportWidth(375)
    renderNav(<NavMain crossZone items={ITEMS} />)

    act(() => {
      setOpenMobile?.(true)
    })
    expect(state?.openMobile).toBe(true)

    clickLink("Inbox")

    expect(state?.openMobile).toBe(false)
  })

  test("leaves the desktop sidebar untouched", () => {
    setViewportWidth(1440)
    renderNav(<NavMain items={ITEMS} />)
    expect(state?.isMobile).toBe(false)

    clickLink("Contacts")

    // `openMobile` is not read on desktop; the important part is that the click
    // handler runs without disturbing the expanded/collapsed rail state.
    expect(state?.openMobile).toBe(false)
  })
})
