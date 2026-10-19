import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import BarChart from "../src/components/charts/bar-chart"

class ResizeObserverStub {
  observe() {
    // no layout in jsdom
  }
  unobserve() {
    // no layout in jsdom
  }
  disconnect() {
    // no layout in jsdom
  }
}
globalThis.ResizeObserver ??=
  ResizeObserverStub as unknown as typeof ResizeObserver

describe("BarChart empty state", () => {
  let container: HTMLDivElement
  let root: Root

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

  test("shows noDataLabel as a status when no series has a value", () => {
    act(() => {
      root.render(<BarChart data={[]} noDataLabel="No data" title="T" />)
    })
    const status = container.querySelector('[role="status"]')
    expect(status?.textContent).toBe("No data")
  })

  test("does not show the empty state when there are series", () => {
    act(() => {
      root.render(
        <BarChart
          data={[{ name: "d1", value: [{ label: "A", value: 1 }] }]}
          noDataLabel="No data"
          title="T"
        />,
      )
    })
    expect(container.querySelector('[role="status"]')).toBeNull()
  })
})
