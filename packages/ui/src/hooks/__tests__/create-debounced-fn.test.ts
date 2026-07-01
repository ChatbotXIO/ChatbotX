import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createDebouncedFn } from "../create-debounced-fn"

describe("createDebouncedFn", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("invokes the callback once after the delay elapses", () => {
    const spy = vi.fn()
    const debounced = createDebouncedFn(spy, 1000)

    debounced("a")
    expect(spy).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith("a")
  })

  test("a later call resets the timer (only the last args fire)", () => {
    const spy = vi.fn()
    const debounced = createDebouncedFn(spy, 1000)

    debounced("first")
    vi.advanceTimersByTime(500)
    debounced("second")
    vi.advanceTimersByTime(500)
    expect(spy).not.toHaveBeenCalled()

    vi.advanceTimersByTime(500)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith("second")
  })

  test("cancel() prevents a pending invocation from firing", () => {
    const spy = vi.fn()
    const debounced = createDebouncedFn(spy, 1000)

    debounced("a")
    debounced.cancel()
    vi.advanceTimersByTime(5000)

    expect(spy).not.toHaveBeenCalled()
  })

  test("flush() invokes the pending callback immediately with the last args", () => {
    const spy = vi.fn()
    const debounced = createDebouncedFn(spy, 1000)

    debounced("a")
    debounced("b")
    debounced.flush()

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith("b")

    vi.advanceTimersByTime(5000)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  test("flush() is a no-op when nothing is pending", () => {
    const spy = vi.fn()
    const debounced = createDebouncedFn(spy, 1000)

    debounced.flush()
    expect(spy).not.toHaveBeenCalled()
  })
})
