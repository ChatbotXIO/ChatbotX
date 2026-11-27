import * as React from "react"

import { useCallbackRef } from "@chatbotx.io/ui/hooks/use-callback-ref"
import { createDebouncedFn, type DebouncedFn } from "./create-debounced-fn"

type DebounceOptions = {
  maxWait?: number
  /**
   * Invokes a pending call when the component unmounts. Use only when the
   * pending call is a durability guarantee, such as an autosave. Calling
   * `cancel()` before unmount still makes this flush a no-op.
   */
  flushOnUnmount?: boolean
}

export function useDebouncedCallback<T extends (...args: never[]) => unknown>(
  callback: T,
  delay: number,
  maxWaitOrOptions?: number | DebounceOptions,
): DebouncedFn<T> {
  const handleCallback = useCallbackRef(callback)

  // `handleCallback` is identity-stable (useCallbackRef memoizes once), so the
  // debounced fn is stable across renders. Stability matters: the autosave effect
  // in react-flow-wrapper depends on this returned function.
  const maxWait =
    typeof maxWaitOrOptions === "number"
      ? maxWaitOrOptions
      : maxWaitOrOptions?.maxWait
  const flushOnUnmount =
    typeof maxWaitOrOptions === "object" &&
    maxWaitOrOptions.flushOnUnmount === true
  const flushOnUnmountRef = React.useRef(flushOnUnmount)
  flushOnUnmountRef.current = flushOnUnmount

  const debounced = React.useMemo(
    () => createDebouncedFn(handleCallback as T, delay, maxWait),
    [handleCallback, delay, maxWait],
  )

  React.useEffect(
    () => () => {
      if (flushOnUnmountRef.current) {
        debounced.flush()
        return
      }

      debounced.cancel()
    },
    [debounced],
  )

  return debounced
}
