import { readFileSync } from "node:fs"
import { join } from "node:path"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test } from "vitest"
import { FullBleed } from "@/components/full-bleed"

/**
 * A `height` class here would be the bug this component exists to avoid: the
 * height is derived from the shell, never hand-copied as a viewport unit.
 */
const HEIGHT_CLASS = /(?:^|\s)h-/

const WORKSPACE_LAYOUT = join(
  process.cwd(),
  "src/app/space/[workspaceId]/layout.tsx",
)

/** `<main>` must be able to shrink to the cap, or the cap does nothing. */
const MAIN_CAN_SHRINK = /<main className="[^"]*\bmin-h-0\b/

let container: HTMLDivElement | null = null
let root: Root | null = null

function renderFullBleed() {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <FullBleed>
        <div data-testid="page" />
      </FullBleed>,
    )
  })

  const el = container.firstElementChild
  expect(el).not.toBeNull()
  return el as HTMLElement
}

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount()
    })
  }
  container?.remove()
  container = null
  root = null
})

describe("FullBleed", () => {
  test("grows into the shell's column instead of naming its own height", () => {
    const el = renderFullBleed()

    expect(el.className).toContain("flex-1")
    expect(el.className).toContain("min-h-0")
    expect(el.className).not.toMatch(HEIGHT_CLASS)
  })

  test("marks itself so the shell can cap its height", () => {
    const el = renderFullBleed()

    expect(el.hasAttribute("data-full-bleed")).toBe(true)
  })
})

/**
 * The shell half of the pair lives in an async Server Component that reaches
 * for the session, quota and integration services, so it cannot be rendered
 * here. These assertions still pin the two classes that make `FullBleed`'s
 * `flex-1` resolve to the viewport — drop either one and the inbox composer
 * silently falls below the fold on a short viewport, with no test to catch it.
 */
describe("workspace shell", () => {
  const source = readFileSync(WORKSPACE_LAYOUT, "utf8")

  test("caps itself at the viewport for full-bleed pages only", () => {
    expect(source).toContain("has-data-full-bleed:h-svh")
  })

  test("lets its content column shrink to that cap", () => {
    expect(source).toMatch(MAIN_CAN_SHRINK)
  })
})
