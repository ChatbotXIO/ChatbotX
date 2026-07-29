import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { NumberInput } from "../src/components/ui/input-number"

describe("NumberInput", () => {
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

  test("emits increment and decrement values from the stepper buttons", () => {
    const onValueChange = vi.fn()

    act(() => {
      root.render(
        <NumberInput
          max={10}
          min={0}
          onValueChange={onValueChange}
          stepper={3}
          value={2}
        />,
      )
    })

    const increaseButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Increase value"]',
    )
    const decreaseButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Decrease value"]',
    )

    expect(increaseButton).not.toBeNull()
    expect(decreaseButton).not.toBeNull()

    act(() => {
      increaseButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(onValueChange).toHaveBeenLastCalledWith(5)

    act(() => {
      decreaseButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(onValueChange).toHaveBeenLastCalledWith(2)
  })

  test("emits stepper values when the current value is empty", () => {
    const onValueChange = vi.fn()

    act(() => {
      root.render(<NumberInput onValueChange={onValueChange} stepper={2} />)
    })

    const increaseButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Increase value"]',
    )

    act(() => {
      increaseButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(onValueChange).toHaveBeenLastCalledWith(2)

    act(() => {
      root.render(
        <NumberInput
          key="decrease-from-empty"
          onValueChange={onValueChange}
          stepper={2}
        />,
      )
    })

    const decreaseButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Decrease value"]',
    )

    act(() => {
      decreaseButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(onValueChange).toHaveBeenLastCalledWith(-2)
  })

  test("emits keyboard arrow increments and decrements", () => {
    const onValueChange = vi.fn()

    act(() => {
      root.render(
        <NumberInput onValueChange={onValueChange} stepper={4} value={6} />,
      )
    })

    const input = container.querySelector("input")
    expect(input).not.toBeNull()

    act(() => {
      input?.focus()
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }))
    })

    expect(onValueChange).toHaveBeenLastCalledWith(10)

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }))
    })

    expect(onValueChange).toHaveBeenLastCalledWith(6)
  })

  test("emits blur-clamped values at the min and max boundaries", () => {
    const onValueChange = vi.fn()
    const onBlur = vi.fn()

    act(() => {
      root.render(
        <NumberInput
          key="max-clamp"
          max={10}
          min={0}
          onBlur={onBlur}
          onValueChange={onValueChange}
          value={15}
        />,
      )
    })

    const input = container.querySelector("input")
    expect(input).not.toBeNull()

    act(() => {
      input?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
    })

    expect(onValueChange).toHaveBeenLastCalledWith(10)
    expect(onBlur).toHaveBeenCalledTimes(1)

    act(() => {
      root.render(
        <NumberInput
          key="min-clamp"
          max={10}
          min={5}
          onBlur={onBlur}
          onValueChange={onValueChange}
          value={2}
        />,
      )
    })

    act(() => {
      container
        .querySelector("input")
        ?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
    })

    expect(onValueChange).toHaveBeenLastCalledWith(5)
    expect(onBlur).toHaveBeenCalledTimes(2)
  })
})
