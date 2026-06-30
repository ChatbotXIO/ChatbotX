export type DebouncedFn<T extends (...args: never[]) => unknown> = ((
  ...args: Parameters<T>
) => void) & {
  cancel: () => void
  flush: () => void
}

/**
 * Framework-free debouncer. Returns a callable that delays `callback` by `delay`
 * ms, plus `cancel()` (drop the pending call) and `flush()` (run it now with the
 * last args). Used by `useDebouncedCallback`.
 */
export function createDebouncedFn<T extends (...args: never[]) => unknown>(
  callback: T,
  delay: number,
): DebouncedFn<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastArgs: Parameters<T> | undefined

  const debounced = ((...args: Parameters<T>) => {
    lastArgs = args
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      callback(...(lastArgs as Parameters<T>))
    }, delay)
  }) as DebouncedFn<T>

  debounced.cancel = () => {
    clearTimeout(timer)
    timer = undefined
    lastArgs = undefined
  }

  debounced.flush = () => {
    if (timer === undefined) {
      return
    }
    clearTimeout(timer)
    timer = undefined
    if (lastArgs) {
      callback(...lastArgs)
    }
  }

  return debounced
}
