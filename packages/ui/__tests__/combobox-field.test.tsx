import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { ComboboxField } from "../src/components/form/combobox-field"

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

type ComboboxForm = {
  field: string
}

const options = [
  { label: "Alpha", value: "alpha" },
  { label: "Beta", value: "beta" },
]

const ComboboxHarness = ({ portal }: { portal?: boolean }) => {
  const form = useForm<ComboboxForm>({
    defaultValues: {
      field: "",
    },
  })

  return (
    <FormProvider {...form}>
      <ComboboxField<ComboboxForm>
        label="Field"
        name="field"
        options={options}
        portal={portal}
      />
    </FormProvider>
  )
}

describe("ComboboxField", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
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

  test("renders the open popover content in a body-level portal by default", () => {
    act(() => {
      root.render(<ComboboxHarness />)
    })

    const trigger = container.querySelector("button[role='combobox']")
    expect(trigger).not.toBeNull()

    act(() => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(container.textContent).not.toContain("Alpha")
    expect(document.body.textContent).toContain("Alpha")
  })

  test("renders the open popover content inline when portal is false", () => {
    act(() => {
      root.render(<ComboboxHarness portal={false} />)
    })

    const trigger = container.querySelector("button[role='combobox']")
    expect(trigger).not.toBeNull()

    act(() => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(container.textContent).toContain("Alpha")
  })
})
