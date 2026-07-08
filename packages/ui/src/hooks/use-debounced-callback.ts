import * as React from "react"

import { useCallbackRef } from "@chatbotx.io/ui/hooks/use-callback-ref"
import { createDebouncedFn, type DebouncedFn } from "./create-debounced-fn"

type DebounceOptions = {
  maxWait?: number
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
  const debounced = React.useMemo(
    () => createDebouncedFn(handleCallback as T, delay, maxWaitOrOptions),
    [handleCallback, delay, maxWaitOrOptions],
  )

  React.useEffect(() => () => debounced.cancel(), [debounced])

  return debounced
}
