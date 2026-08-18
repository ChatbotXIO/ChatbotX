import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../src/components/ui/dialog"

/**
 * ~60 dialogs across the app pass an unprefixed `max-w-*`. tailwind-merge
 * resolves `max-w` by group, so those replace the base `max-w-[calc(100%-2rem)]`
 * guard and used to leave the dialog edge-to-edge on a phone. The width is a
 * separate group, so it survives — that is what these tests pin.
 */
const FULL_WIDTH_CLASS = /(^|\s)w-full(\s|$)/

describe("DialogContent mobile width", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (className?: string) => {
    act(() => {
      root.render(
        <Dialog open>
          <DialogContent className={className}>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription>Description</DialogDescription>
          </DialogContent>
        </Dialog>,
      )
    })
  }

  const popup = () =>
    document.querySelector<HTMLElement>('[data-slot="dialog-content"]')

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

  test("keeps a viewport gutter by default", () => {
    render()

    expect(popup()?.className).toContain("w-[calc(100%-2rem)]")
    expect(popup()?.className).toContain("max-w-[calc(100%-2rem)]")
  })

  test("keeps the gutter when a caller overrides max-width", () => {
    render("max-w-lg")

    const className = popup()?.className ?? ""
    // The caller's max-width wins, as intended for wide viewports...
    expect(className).toContain("max-w-lg")
    expect(className).not.toContain("max-w-[calc(100%-2rem)]")
    // ...but the width still caps the dialog short of the screen edges.
    expect(className).toContain("w-[calc(100%-2rem)]")
  })

  test("never falls back to a full-bleed w-full", () => {
    render("max-h-screen max-w-5xl overflow-y-scroll")

    const className = popup()?.className ?? ""
    expect(className).toContain("w-[calc(100%-2rem)]")
    expect(className).not.toMatch(FULL_WIDTH_CLASS)
  })
})
