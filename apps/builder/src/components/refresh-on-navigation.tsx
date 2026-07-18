"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

export function RefreshOnNavigation() {
  const pathname = usePathname()
  const router = useRouter()
  const isInitialRender = useRef(true)

  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false
      return
    }

    if (pathname) {
      router.refresh()
    }
  }, [pathname, router])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        router.refresh()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [router])

  return null
}
