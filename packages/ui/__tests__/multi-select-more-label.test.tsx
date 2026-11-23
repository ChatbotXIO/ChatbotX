import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import {
  MultiSelect,
  type MultiSelectLabels,
} from "../src/components/ui/sersavan/multi-select"

const noop = () => {
  // jsdom does not implement this API
}

class ResizeObserverStub {
  observe = noop
  unobserve = noop
  disconnect = noop
}

globalThis.ResizeObserver ??=
  ResizeObserverStub as unknown as typeof ResizeObserver
Element.prototype.scrollIntoView ??= noop

const options = [
  { label: "Alpha", value: "alpha" },
  { label: "Beta", value: "beta" },
  { label: "Gamma", value: "gamma" },
]

describe("MultiSelect hidden-selection chip", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (labels?: MultiSelectLabels) => {
    act(() => {
      root.render(
        <MultiSelect
          defaultValue={["alpha", "beta", "gamma"]}
          labels={labels}
          maxCount={1}
          onValueChange={noop}
          options={options}
          placeholder="Pick"
        />,
      )
    })
  }

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  test("says how many selections are hidden, in English by default", () => {
    render()

    expect(container.textContent).toContain("+ 2 more")
  })

  test("uses the caller's wording for the hidden count", () => {
    render({ moreSelected: (hiddenCount) => `${hiddenCount} nữa` })

    expect(container.textContent).toContain("2 nữa")
    expect(container.textContent).not.toContain("more")
  })
})
