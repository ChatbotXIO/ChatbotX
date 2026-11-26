"use client"

import { useSyncExternalStore } from "react"

const subscribe = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange)
  return () => document.removeEventListener("visibilitychange", onChange)
}

/** False while the tab is hidden; the server snapshot assumes visible. */
export const usePageVisible = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => document.visibilityState === "visible",
    () => true,
  )
