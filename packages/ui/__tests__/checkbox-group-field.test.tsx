import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { CheckboxGroupField } from "../src/components/form/checkbox-group-field"

// jsdom ships no PointerEvent constructor; base-ui's checkbox click handler
// re-dispatches one internally.
if (typeof globalThis.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    constructor(type: string, params: MouseEventInit = {}) {
      super(type, params)
    }
  }
  Object.assign(globalThis, { PointerEvent: PointerEventPolyfill })
}

type CheckboxGroupForm = {
  ids: string[]
}

const options = [
  {
    value: "alpha",
    label: "Alpha",
    description: "first option",
    leading: <span data-testid="leading-alpha">A</span>,
  },
  { value: "beta", label: "Beta", disabled: true },
  {
    value: "gamma",
    label: "Gamma",
    trailing: (
      <button data-testid="trailing-gamma" type="button">
        Trailing
      </button>
    ),
  },
]

const CheckboxGroupHarness = ({
  defaultValues = { ids: [] },
}: {
  defaultValues?: CheckboxGroupForm
}) => {
  const form = useForm<CheckboxGroupForm>({ defaultValues })

  return (
    <FormProvider {...form}>
      <CheckboxGroupField<CheckboxGroupForm> name="ids" options={options} />
    </FormProvider>
  )
}

describe("CheckboxGroupField", () => {
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
  })

  // The visible, interactive control is the base-ui checkbox `[role="checkbox"]`
  // span; `#ids-${value}` is claimed by the visually-hidden native
  // `<input>` base-ui renders alongside it for form semantics.
  const checkboxFor = (value: string) => {
    const input = container.querySelector<HTMLInputElement>(
      `input#ids-${value}`,
    )
    return (
      input?.closest("div")?.querySelector<HTMLElement>('[role="checkbox"]') ??
      null
    )
  }

  test("namespaces each checkbox id with the field name and option value", () => {
    act(() => {
      root.render(<CheckboxGroupHarness />)
    })

    expect(checkboxFor("alpha")).not.toBeNull()
    expect(checkboxFor("beta")).not.toBeNull()
    expect(checkboxFor("gamma")).not.toBeNull()

    // Base UI renders the checkbox as a `<span role="checkbox">` (not a
    // labelable element), so the name is linked with aria-labelledby, and the
    // text column toggles the row itself.
    const alpha = checkboxFor("alpha")
    const labelId = alpha?.getAttribute("aria-labelledby")
    expect(labelId).toBeTruthy()
    expect(container.querySelector(`#${labelId}`)?.textContent).toBe("Alpha")
  })

  test("clicking the option's name or description toggles it, like the checkbox does", () => {
    act(() => {
      root.render(<CheckboxGroupHarness />)
    })

    const alpha = checkboxFor("alpha")
    const name = container.querySelector(
      `#${alpha?.getAttribute("aria-labelledby")}`,
    )
    act(() => {
      name?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(checkboxFor("alpha")?.getAttribute("aria-checked")).toBe("true")

    const description = container.querySelector(
      '[data-slot="checkbox-group-description"][data-value="alpha"]',
    )
    expect(description).not.toBeNull()
    act(() => {
      description?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(checkboxFor("alpha")?.getAttribute("aria-checked")).toBe("false")
  })

  test("clicking a disabled option's name does not toggle it", () => {
    act(() => {
      root.render(<CheckboxGroupHarness />)
    })

    const beta = checkboxFor("beta")
    const name = container.querySelector(
      `#${beta?.getAttribute("aria-labelledby")}`,
    )
    act(() => {
      name?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(checkboxFor("beta")?.getAttribute("aria-checked")).toBe("false")
  })

  test("renders the leading node before the label", () => {
    act(() => {
      root.render(<CheckboxGroupHarness />)
    })

    expect(
      container.querySelector('[data-testid="leading-alpha"]'),
    ).not.toBeNull()
  })

  test("marks a disabled option's checkbox disabled and does not toggle it on click", () => {
    act(() => {
      root.render(<CheckboxGroupHarness defaultValues={{ ids: [] }} />)
    })

    const beta = checkboxFor("beta")
    expect(beta?.getAttribute("aria-disabled")).toBe("true")

    act(() => {
      beta?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(beta?.getAttribute("aria-checked")).toBe("false")
  })

  test("toggles an enabled option on and off via click", () => {
    act(() => {
      root.render(<CheckboxGroupHarness />)
    })

    const alpha = checkboxFor("alpha")
    expect(alpha?.getAttribute("aria-checked")).toBe("false")

    act(() => {
      alpha?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(alpha?.getAttribute("aria-checked")).toBe("true")

    act(() => {
      alpha?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(alpha?.getAttribute("aria-checked")).toBe("false")
  })

  test("renders the trailing node at the end of the row, after the label", () => {
    act(() => {
      root.render(<CheckboxGroupHarness />)
    })

    const trailing = container.querySelector('[data-testid="trailing-gamma"]')
    expect(trailing).not.toBeNull()

    const row = checkboxFor("gamma")?.closest("div")?.parentElement
    const label = container.querySelector("#ids-gamma-label")
    expect(row?.contains(trailing as Node)).toBe(true)
    // Outside the label — a trailing control must never act as a second
    // click target for the checkbox.
    expect(label?.contains(trailing as Node)).toBe(false)
  })

  test("clicking the trailing node does not toggle the row's checkbox", () => {
    act(() => {
      root.render(<CheckboxGroupHarness />)
    })

    const gamma = checkboxFor("gamma")
    expect(gamma?.getAttribute("aria-checked")).toBe("false")

    act(() => {
      container
        .querySelector('[data-testid="trailing-gamma"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(gamma?.getAttribute("aria-checked")).toBe("false")
  })

  test("reflects a pre-selected value from defaultValues as checked", () => {
    act(() => {
      root.render(<CheckboxGroupHarness defaultValues={{ ids: ["gamma"] }} />)
    })

    expect(checkboxFor("gamma")?.getAttribute("aria-checked")).toBe("true")
    expect(checkboxFor("alpha")?.getAttribute("aria-checked")).toBe("false")
  })
})

/**
 * jsdom performs no layout, so `scrollWidth`/`clientWidth` are always 0 here
 * and cannot prove "no horizontal scrollbar". These assert the structure that
 * guarantees it instead — the label column can shrink and truncates, the
 * trailing slot cannot shrink, and the list clips rather than scrolls
 * sideways — and are honest about being a proxy for a real layout check.
 */
describe("CheckboxGroupField — row overflow guards (structural, not layout)", () => {
  let container: HTMLDivElement
  let root: Root

  const longLabel =
    "An extremely long account name that would otherwise push the trailing switch past the right edge of the list container"

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
  })

  const LongRowHarness = () => {
    const form = useForm<CheckboxGroupForm>({ defaultValues: { ids: [] } })

    return (
      <FormProvider {...form}>
        <CheckboxGroupField<CheckboxGroupForm>
          name="ids"
          options={[
            {
              value: "long",
              label: longLabel,
              description: longLabel,
              trailing: (
                <button data-testid="trailing-long" type="button">
                  Sync
                </button>
              ),
            },
          ]}
        />
      </FormProvider>
    )
  }

  test("the label column shrinks and truncates while the trailing slot keeps its size", () => {
    act(() => {
      root.render(<LongRowHarness />)
    })

    const label = container.querySelector("#ids-long-label")
    expect(label?.className).toContain("truncate")
    // Truncated text is only recoverable through the tooltip.
    expect(label?.getAttribute("title")).toBe(longLabel)

    const labelColumn = label?.parentElement
    expect(labelColumn?.className).toContain("min-w-0")
    expect(labelColumn?.className).toContain("flex-1")

    const description = labelColumn?.querySelector("p")
    expect(description?.className).toContain("truncate")
    expect(description?.getAttribute("title")).toBe(longLabel)

    const trailingSlot = container.querySelector(
      '[data-testid="trailing-long"]',
    )?.parentElement
    expect(trailingSlot?.className).toContain("shrink-0")
  })

  test("the list clips horizontally instead of scrolling sideways", () => {
    act(() => {
      root.render(<LongRowHarness />)
    })

    const list = container
      .querySelector('[data-testid="trailing-long"]')
      ?.closest("div.space-y-2")
    expect(list?.className).toContain("overflow-x-hidden")
  })
})
