import { setViewportWidth } from "@chatbotx.io/vitest-config/setup-dom"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { MOBILE_BREAKPOINT, useIsMobile } from "../src/hooks/use-mobile"

function Probe({ onRead }: { onRead: (value: boolean) => void }) {
  onRead(useIsMobile())
  return null
}

describe("useIsMobile", () => {
  let container: HTMLDivElement
  let root: Root
  let latest: boolean | undefined

  const render = () => {
    act(() => {
      root.render(
        <Probe
          onRead={(value) => {
            latest = value
          }}
        />,
      )
    })
  }

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    latest = undefined
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

  test("reports mobile one pixel below the breakpoint", () => {
    setViewportWidth(MOBILE_BREAKPOINT - 1)
    render()

    expect(latest).toBe(true)
  })

  test("reports desktop exactly at the breakpoint", () => {
    setViewportWidth(MOBILE_BREAKPOINT)
    render()

    expect(latest).toBe(false)
  })

  test("reports desktop well above the breakpoint", () => {
    setViewportWidth(1440)
    render()

    expect(latest).toBe(false)
  })

  test("follows the viewport when it crosses the breakpoint", () => {
    setViewportWidth(1440)
    render()
    expect(latest).toBe(false)

    act(() => {
      setViewportWidth(375)
    })
    expect(latest).toBe(true)

    act(() => {
      setViewportWidth(1024)
    })
    expect(latest).toBe(false)
  })

  test("stays paired with Tailwind's md breakpoint", () => {
    // The hook's JS branch and every `md:` CSS branch must agree about which
    // layout is showing. Tailwind v4's stock `md` is 48rem = 768px and this
    // repo defines no `--breakpoint-*` override.
    expect(MOBILE_BREAKPOINT).toBe(768)
  })
})
