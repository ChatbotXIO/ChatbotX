import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { SectionErrorBoundary } from "@/components/section-error-boundary"

let container: HTMLDivElement | null = null
let root: Root | null = null

const render = (ui: React.ReactNode): HTMLDivElement => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <div>
        <p data-testid="rest-of-page">rest of the page</p>
        {ui}
      </div>,
    )
  })
  return container
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
  vi.restoreAllMocks()
})

function FailingSection(): never {
  throw new Error("reading the section failed")
}

describe("SectionErrorBoundary", () => {
  test("renders its section when nothing fails", () => {
    const el = render(
      <SectionErrorBoundary fallback={<p>failed</p>}>
        <p data-testid="section">section</p>
      </SectionErrorBoundary>,
    )

    expect(el.querySelector('[data-testid="section"]')).not.toBeNull()
    expect(el.textContent).not.toContain("failed")
  })

  test("a failing section shows the fallback in its place and the rest of the page stays", () => {
    // React reports the caught error to the console; keep the test output clean.
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    const el = render(
      <SectionErrorBoundary fallback={<p data-testid="fallback">failed</p>}>
        <FailingSection />
      </SectionErrorBoundary>,
    )

    expect(el.querySelector('[data-testid="fallback"]')).not.toBeNull()
    expect(el.querySelector('[data-testid="rest-of-page"]')).not.toBeNull()
  })
})
