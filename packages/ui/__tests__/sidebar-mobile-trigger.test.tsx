import { setViewportWidth } from "@chatbotx.io/vitest-config/setup-dom"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import {
  SidebarMobileTrigger,
  SidebarProvider,
  useSidebar,
} from "../src/components/ui/sidebar"

function SidebarStateProbe({
  onRead,
}: {
  onRead: (state: { openMobile: boolean; isMobile: boolean }) => void
}) {
  const { openMobile, isMobile } = useSidebar()
  onRead({ openMobile, isMobile })
  return null
}

describe("SidebarMobileTrigger", () => {
  let container: HTMLDivElement
  let root: Root
  let state: { openMobile: boolean; isMobile: boolean } | undefined

  const renderShell = () => {
    act(() => {
      root.render(
        <SidebarProvider>
          <SidebarMobileTrigger />
          <SidebarStateProbe
            onRead={(next) => {
              state = next
            }}
          />
        </SidebarProvider>,
      )
    })
  }

  const trigger = () =>
    container.querySelector<HTMLButtonElement>(
      '[data-slot="sidebar-mobile-trigger"]',
    )

  const click = (element: HTMLElement) => {
    act(() => {
      element.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      )
    })
  }

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    state = undefined
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

  test("renders a labelled button", () => {
    setViewportWidth(375)
    renderShell()

    const button = trigger()
    expect(button).not.toBeNull()
    expect(button?.textContent).toContain("Toggle Sidebar")
  })

  test("opens the sidebar sheet on a mobile viewport", () => {
    setViewportWidth(375)
    renderShell()
    expect(state?.isMobile).toBe(true)
    expect(state?.openMobile).toBe(false)

    const button = trigger()
    if (!button) {
      throw new Error("mobile trigger did not render")
    }
    click(button)

    expect(state?.openMobile).toBe(true)
  })

  test("closes the sheet when tapped again", () => {
    setViewportWidth(375)
    renderShell()

    const button = trigger()
    if (!button) {
      throw new Error("mobile trigger did not render")
    }
    click(button)
    expect(state?.openMobile).toBe(true)

    click(button)
    expect(state?.openMobile).toBe(false)
  })

  test("still renders above the breakpoint so callers control visibility", () => {
    // The button hides itself nowhere — the shell wraps it in an `md:hidden`
    // container. A caller with an always-mobile shell can render it unwrapped.
    setViewportWidth(1440)
    renderShell()

    expect(trigger()).not.toBeNull()
    expect(state?.isMobile).toBe(false)
  })
})
