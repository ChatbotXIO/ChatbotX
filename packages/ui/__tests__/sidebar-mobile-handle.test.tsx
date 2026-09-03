import { setViewportWidth } from "@chatbotx.io/vitest-config/setup-dom"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import {
  SidebarMobileHandle,
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

describe("SidebarMobileHandle", () => {
  let container: HTMLDivElement
  let root: Root
  let state: { openMobile: boolean; isMobile: boolean } | undefined

  const renderShell = () => {
    act(() => {
      root.render(
        <SidebarProvider>
          <SidebarMobileHandle />
          <SidebarStateProbe
            onRead={(next) => {
              state = next
            }}
          />
        </SidebarProvider>,
      )
    })
  }

  const handle = () =>
    container.querySelector<HTMLButtonElement>(
      '[data-slot="sidebar-mobile-handle"]',
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

    const button = handle()
    expect(button).not.toBeNull()
    expect(button?.textContent).toContain("Toggle Sidebar")
  })

  test("opens the sidebar sheet on a mobile viewport", () => {
    setViewportWidth(375)
    renderShell()
    expect(state?.isMobile).toBe(true)
    expect(state?.openMobile).toBe(false)

    const button = handle()
    if (!button) {
      throw new Error("mobile handle did not render")
    }
    click(button)

    expect(state?.openMobile).toBe(true)
  })

  test("closes the sheet when tapped again", () => {
    setViewportWidth(375)
    renderShell()

    const button = handle()
    if (!button) {
      throw new Error("mobile handle did not render")
    }
    click(button)
    expect(state?.openMobile).toBe(true)

    click(button)
    expect(state?.openMobile).toBe(false)
  })

  test("hides itself from md up, so the shell only has to render it", () => {
    // The shell renders this unconditionally, with no `md:hidden` wrapper of
    // its own — the whole viewport belongs to page content, so the control
    // carries its own breakpoint instead.
    setViewportWidth(1440)
    renderShell()

    expect(handle()?.className).toContain("md:hidden")
  })

  test("reserves no space in the document flow", () => {
    // A drawer handle, not a bar: it floats over the content instead of
    // pushing it down.
    setViewportWidth(375)
    renderShell()

    expect(handle()?.className).toContain("fixed")
  })
})
