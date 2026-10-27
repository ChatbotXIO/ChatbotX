// @vitest-environment jsdom
import { act, cloneElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// Base UI mounts the popup only once hovered; render the primitives as plain
// markup so the test covers StageName's own branching (hover is browser-verified).
vi.mock("@chatbotx.io/ui/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({
    render,
    children,
  }: {
    render: React.ReactElement
    children: React.ReactNode
  }) => cloneElement(render, {}, children),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
}))

import { StageName } from "../stage-name"

describe("StageName", () => {
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

  const heading = () => container.querySelector("h3")
  const hint = () => container.querySelector('[data-testid="tooltip-content"]')

  test.each([
    null,
    "",
    "   ",
  ])("a stage without a description (%j) has no hint", (description) => {
    act(() => root.render(<StageName description={description} name="Lead" />))
    expect(heading()?.textContent).toBe("Lead")
    expect(heading()?.querySelector("button")).toBeNull()
    expect(hint()).toBeNull()
  })

  test("a described stage hints its description on the name", () => {
    act(() =>
      root.render(
        <StageName description={"Called once\nwaiting"} name="Contacted" />,
      ),
    )
    // A focusable trigger inside the heading, so keyboard users reach the hint.
    const trigger = heading()?.querySelector("button")
    expect(trigger?.textContent).toBe("Contacted")
    // Screen readers hear the description too.
    const describedBy = trigger?.getAttribute("aria-describedby") ?? ""
    const hidden = document.getElementById(describedBy)
    expect(hidden?.textContent).toBe("Called once\nwaiting")
    // ...but it is not read as part of the stage name.
    expect(heading()?.contains(hidden ?? null)).toBe(false)
    expect(hint()?.textContent).toBe("Called once\nwaiting")
  })
})
