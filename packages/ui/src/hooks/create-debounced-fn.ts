export type DebouncedFn<T extends (...args: never[]) => unknown> = ((
  ...args: Parameters<T>
) => void) & {
  cancel: () => void
  flush: () => void
}

type DebounceOptions = {
  maxWait?: number
}

/**
 * Framework-free debouncer. Returns a callable that delays `callback` by `delay`
 * ms, plus `cancel()` (drop the pending call) and `flush()` (run it now with the
 * last args). Used by `useDebouncedCallback`.
 */
export function createDebouncedFn<T extends (...args: never[]) => unknown>(
  callback: T,
  delay: number,
  maxWaitOrOptions?: number | DebounceOptions,
): DebouncedFn<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastArgs: Parameters<T> | undefined
  let burstStartTime: number | undefined

  const maxWait =
    typeof maxWaitOrOptions === "number"
      ? maxWaitOrOptions
      : maxWaitOrOptions?.maxWait

  const clearTimer = () => {
    clearTimeout(timer)
    timer = undefined
  }

  const resetBurst = () => {
    burstStartTime = undefined
    lastArgs = undefined
  }

  const invoke = () => {
    if (!lastArgs) {
      clearTimer()
      resetBurst()
      return
    }

    const args = lastArgs
    clearTimer()
    resetBurst()
    callback(...args)
  }

  const schedule = () => {
    const now = Date.now()
    const maxWaitRemaining =
      maxWait === undefined || burstStartTime === undefined
        ? undefined
        : Math.max(0, maxWait - (now - burstStartTime))
    const timeout =
      maxWaitRemaining === undefined
        ? delay
        : Math.min(delay, maxWaitRemaining)

    clearTimer()
    timer = setTimeout(invoke, timeout)
  }

  const debounced = ((...args: Parameters<T>) => {
    lastArgs = args
    if (burstStartTime === undefined) {
      burstStartTime = Date.now()
    }

    schedule()
  }) as DebouncedFn<T>

  debounced.cancel = () => {
    clearTimer()
    resetBurst()
  }

  debounced.flush = () => {
    if (timer === undefined) {
      return
    }
    invoke()
  }

  return debounced
}
