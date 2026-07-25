import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { InputNumberField } from "../src/components/form/input-number-field"

type NumberForm = {
  amount?: number
}

const InputNumberFieldHarness = ({
  amount,
  max = 10,
  min = 0,
}: {
  amount?: number
  max?: number
  min?: number
}) => {
  const form = useForm<NumberForm>({
    defaultValues: {
      amount,
    },
  })
  const watchedAmount = form.watch("amount")

  return (
    <FormProvider {...form}>
      <InputNumberField<NumberForm>
        label="Amount"
        max={max}
        min={min}
        name="amount"
        stepper={2}
      />
      <output data-testid="amount">{watchedAmount ?? ""}</output>
    </FormProvider>
  )
}

describe("InputNumberField", () => {
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

  test("syncs stepper clicks into React Hook Form state", () => {
    act(() => {
      root.render(<InputNumberFieldHarness amount={0} />)
    })

    const increaseButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Increase value"]',
    )

    act(() => {
      increaseButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(
      container.querySelector<HTMLOutputElement>('[data-testid="amount"]')
        ?.textContent,
    ).toBe("2")
  })

  test("syncs blur-clamped values into React Hook Form state", () => {
    act(() => {
      root.render(<InputNumberFieldHarness amount={15} />)
    })

    act(() => {
      container
        .querySelector("input")
        ?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
    })

    expect(
      container.querySelector<HTMLOutputElement>('[data-testid="amount"]')
        ?.textContent,
    ).toBe("10")

    act(() => {
      root.render(
        <InputNumberFieldHarness amount={2} key="min-clamp" min={5} />,
      )
    })

    act(() => {
      container
        .querySelector("input")
        ?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
    })

    expect(
      container.querySelector<HTMLOutputElement>('[data-testid="amount"]')
        ?.textContent,
    ).toBe("5")
  })
})
