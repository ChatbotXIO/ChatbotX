import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { DebouncedFn } from "../create-debounced-fn"
import { useDebouncedCallback } from "../use-debounced-callback"

type StringDebouncedFn = DebouncedFn<(value: string) => void>

type ProbeProps = {
  callback: (value: string) => void
  onDebounced: (debounced: StringDebouncedFn) => void
  options?: { maxWait?: number; flushOnUnmount?: boolean }
}

function Probe({ callback, onDebounced, options }: ProbeProps) {
  const debounced = useDebouncedCallback(callback, 100, options)
  onDebounced(debounced)
  return null
}

describe("useDebouncedCallback", () => {
  let container: HTMLDivElement
  let root: Root
  let debounced: StringDebouncedFn

  const render = (
    callback: (value: string) => void,
    options?: { maxWait?: number; flushOnUnmount?: boolean },
  ) => {
    act(() => {
      root.render(
        <Probe
          callback={callback}
          onDebounced={(nextDebounced) => {
            debounced = nextDebounced
          }}
          options={options}
        />,
      )
    })
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.useFakeTimers()
    vi.setSystemTime(0)
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

  test("cancels pending calls when unmounted by default", () => {
    const callback = vi.fn()
    render(callback)

    debounced("pending")
    act(() => {
      root.unmount()
    })
    vi.advanceTimersByTime(100)

    expect(callback).not.toHaveBeenCalled()
  })

  test("flushes the last pending call when unmounted with flushOnUnmount", () => {
    const callback = vi.fn()
    render(callback, { maxWait: 200, flushOnUnmount: true })
    debounced("first")
    debounced("last")
    act(() => {
      root.unmount()
    })
    vi.advanceTimersByTime(100)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith("last")
  })

  test("does not flush a pending call cancelled before unmount", () => {
    const callback = vi.fn()
    render(callback, { maxWait: 200, flushOnUnmount: true })

    debounced("pending")
    debounced.cancel()
    act(() => {
      root.unmount()
    })

    expect(callback).not.toHaveBeenCalled()
  })

  test("keeps the debounced function stable for inline options objects", () => {
    const callback = vi.fn()
    render(callback, { maxWait: 200 })
    const initialDebounced = debounced

    render(callback, { maxWait: 200 })

    expect(debounced).toBe(initialDebounced)
  })
})
