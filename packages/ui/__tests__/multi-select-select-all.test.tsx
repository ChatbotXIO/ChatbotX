import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { MultiSelect } from "../src/components/ui/sersavan/multi-select"

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

const ALL_LABEL = "All things"

const Harness = ({
  allSelectedLabel,
  initial = [],
  onChange,
}: {
  allSelectedLabel?: string
  initial?: string[]
  onChange: (values: string[]) => void
}) => {
  const [values, setValues] = useState(initial)
  return (
    <MultiSelect
      allSelectedLabel={allSelectedLabel}
      defaultValue={values}
      labels={{ selectAll: () => ALL_LABEL }}
      onValueChange={(next) => {
        setValues(next)
        onChange(next)
      }}
      options={options}
      placeholder="Pick"
    />
  )
}

describe("MultiSelect select all (real component)", () => {
  let container: HTMLDivElement
  let root: Root
  const onChange = vi.fn()

  const trigger = () =>
    container.querySelector('[aria-haspopup="listbox"]') as HTMLElement
  const open = async () => {
    await act(() => {
      trigger().click()
    })
  }
  const allRow = () =>
    [...document.querySelectorAll('[role="option"]')].find((node) =>
      node.textContent?.includes(ALL_LABEL),
    ) as HTMLElement
  // cmdk owns `aria-selected` (it marks the highlighted row), so the checked
  // state is read from the visible checkbox.
  const isChecked = (row: HTMLElement) =>
    row
      .querySelector('[aria-hidden="true"]')
      ?.className.includes("bg-primary") ?? false
  const option = (label: string) =>
    [...document.querySelectorAll('[role="option"]')].find(
      (node) => node.textContent === label,
    ) as HTMLElement
  const click = async (node: HTMLElement) => {
    await act(() => {
      node.click()
    })
  }
  const render = async (props: Parameters<typeof Harness>[0]) => {
    await act(() => {
      root.render(<Harness {...props} />)
    })
  }

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    onChange.mockClear()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    for (const node of document.querySelectorAll(
      "[data-radix-popper-content-wrapper]",
    )) {
      node.remove()
    }
  })

  test("clicking All ticks every option", async () => {
    await render({ allSelectedLabel: ALL_LABEL, initial: ["alpha"], onChange })
    await open()

    await click(allRow())

    expect(onChange).toHaveBeenLastCalledWith(["alpha", "beta", "gamma"])
    expect(isChecked(allRow())).toBe(true)
    for (const label of ["Alpha", "Beta", "Gamma"]) {
      expect(isChecked(option(label))).toBe(true)
    }
  })

  test("with everything ticked the trigger shows one label instead of a chip per option", async () => {
    await render({
      allSelectedLabel: ALL_LABEL,
      initial: ["alpha", "beta", "gamma"],
      onChange,
    })

    expect(trigger().textContent).toContain(ALL_LABEL)
    expect(trigger().textContent).not.toContain("Alpha")
  })

  test("unticking one option unchecks All and shows the remaining chips", async () => {
    await render({
      allSelectedLabel: ALL_LABEL,
      initial: ["alpha", "beta", "gamma"],
      onChange,
    })
    await open()

    await click(option("Beta"))

    expect(onChange).toHaveBeenLastCalledWith(["alpha", "gamma"])
    expect(isChecked(allRow())).toBe(false)
    expect(trigger().textContent).toContain("Alpha")
    expect(trigger().textContent).not.toContain(ALL_LABEL)
  })

  test("clicking All while everything is ticked unticks everything", async () => {
    await render({
      allSelectedLabel: ALL_LABEL,
      initial: ["alpha", "beta", "gamma"],
      onChange,
    })
    await open()

    await click(allRow())

    expect(onChange).toHaveBeenLastCalledWith([])
    expect(isChecked(allRow())).toBe(false)
  })

  test("without allSelectedLabel a full selection still renders chips", async () => {
    await render({ initial: ["alpha", "beta", "gamma"], onChange })

    expect(trigger().textContent).toContain("Alpha")
  })
})
