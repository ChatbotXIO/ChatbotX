import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useAutoSubmitCountdown } from "@/features/integration-whatsapp/hooks/use-auto-submit-countdown"

const SECONDS = 3

function Probe({
  active,
  onElapsed,
}: {
  active: boolean
  onElapsed: () => void
}) {
  const secondsLeft = useAutoSubmitCountdown({
    active,
    seconds: SECONDS,
    onElapsed,
  })
  return <span data-testid="seconds-left">{secondsLeft}</span>
}

describe("useAutoSubmitCountdown", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.useFakeTimers()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.useRealTimers()
  })

  const secondsLeft = () =>
    container.querySelector<HTMLElement>("[data-testid='seconds-left']")
      ?.textContent

  test("counts down to zero and fires onElapsed exactly once", () => {
    const onElapsed = vi.fn()

    act(() => {
      root.render(<Probe active onElapsed={onElapsed} />)
    })
    expect(secondsLeft()).toBe("3")

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(secondsLeft()).toBe("2")
    expect(onElapsed).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(secondsLeft()).toBe("0")
    expect(onElapsed).toHaveBeenCalledTimes(1)

    // The deadline clears the display interval, so waiting longer must not
    // re-fire the submit or push the label below zero.
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(secondsLeft()).toBe("0")
    expect(onElapsed).toHaveBeenCalledTimes(1)
  })

  test("stays idle while inactive, then runs when activated", () => {
    const onElapsed = vi.fn()

    act(() => {
      root.render(<Probe active={false} onElapsed={onElapsed} />)
    })

    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(secondsLeft()).toBe("3")
    expect(onElapsed).not.toHaveBeenCalled()

    act(() => {
      root.render(<Probe active onElapsed={onElapsed} />)
    })
    act(() => {
      vi.advanceTimersByTime(SECONDS * 1000)
    })
    expect(onElapsed).toHaveBeenCalledTimes(1)
  })

  test("does not submit after the component unmounts", () => {
    const onElapsed = vi.fn()

    act(() => {
      root.render(<Probe active onElapsed={onElapsed} />)
    })
    act(() => {
      root.unmount()
    })
    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(onElapsed).not.toHaveBeenCalled()
  })
})
