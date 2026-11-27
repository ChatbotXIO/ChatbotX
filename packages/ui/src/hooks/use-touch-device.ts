import * as React from "react"

export const TOUCH_DEVICE_MEDIA_QUERY = "(hover: none) and (pointer: coarse)"

const subscribe = (listener: () => void) => {
  const mediaQueryList = window.matchMedia(TOUCH_DEVICE_MEDIA_QUERY)
  mediaQueryList.addEventListener("change", listener)

  return () => mediaQueryList.removeEventListener("change", listener)
}

export function useIsTouchDevice(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(TOUCH_DEVICE_MEDIA_QUERY).matches,
    () => false,
  )
}
