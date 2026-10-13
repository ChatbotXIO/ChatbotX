import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import {
  WeekdayToggleField,
  type WeekdayToggleOption,
} from "../src/components/form/weekday-toggle-field"

type WeekdayForm = { weekdays: number[] }

// Monday-first, as a European locale would order them.
const options: WeekdayToggleOption[] = [
  { value: 1, label: "Mon", ariaLabel: "Monday" },
  { value: 2, label: "Tue", ariaLabel: "Tuesday" },
  { value: 3, label: "Wed", ariaLabel: "Wednesday" },
  { value: 0, label: "Sun", ariaLabel: "Sunday" },
]

let latestValues: number[] = []

const Harness = ({ initial }: { initial: number[] }) => {
  const form = useForm<WeekdayForm>({ defaultValues: { weekdays: initial } })
  latestValues = form.watch("weekdays")
  return (
    <FormProvider {...form}>
      <WeekdayToggleField<WeekdayForm>
        label="Repeat on"
        name="weekdays"
        options={options}
      />
    </FormProvider>
  )
}

describe("WeekdayToggleField", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    latestValues = []
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  const render = (initial: number[]) => {
    act(() => {
      root.render(<Harness initial={initial} />)
    })
  }

  const button = (name: string) =>
    container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)

  test("renders one button per option in the given order, named in full", () => {
    render([])
    const labels = Array.from(container.querySelectorAll("button")).map(
      (item) => item.getAttribute("aria-label"),
    )
    expect(labels).toEqual(["Monday", "Tuesday", "Wednesday", "Sunday"])
    expect(button("Monday")?.textContent).toBe("Mon")
  })

  test("marks the selected days as pressed", () => {
    render([1, 0])
    expect(button("Monday")?.getAttribute("aria-pressed")).toBe("true")
    expect(button("Sunday")?.getAttribute("aria-pressed")).toBe("true")
    expect(button("Tuesday")?.getAttribute("aria-pressed")).toBe("false")
  })

  test("toggling a day adds it, keeping the numbers sorted", () => {
    render([3])
    act(() => {
      button("Monday")?.click()
    })
    expect(latestValues).toEqual([1, 3])
  })

  test("toggling a pressed day removes it", () => {
    render([1, 3])
    act(() => {
      button("Wednesday")?.click()
    })
    expect(latestValues).toEqual([1])
  })

  test("Sunday is stored as 0, not 7", () => {
    render([])
    act(() => {
      button("Sunday")?.click()
    })
    expect(latestValues).toEqual([0])
  })

  test("shows the label for the group", () => {
    render([])
    expect(container.textContent).toContain("Repeat on")
  })
})
