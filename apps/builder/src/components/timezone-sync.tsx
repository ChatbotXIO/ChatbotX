"use client"

import { resolveFilterTimezone } from "@chatbotx.io/utils/datetime"
import { useRouter } from "next/navigation"
import { startTransition, useEffect, useRef } from "react"
import { getBrowserTimezone } from "@/features/contact-filter/lib/timezone"
import { setUserTimezone } from "@/lib/timezone.action"

/**
 * Keeps the timezone cookie in step with the browser. `timezone` is what the
 * server resolved for this render; when the browser disagrees the cookie is
 * rewritten through a server action and the tree is refreshed so
 * server-rendered dates and next-intl formatting switch to the user's zone.
 * Syncs at most once per mount after a successful write: if the cookie is
 * rejected (blocked cookies, unresolvable zone) the mismatch must not become
 * a refresh loop. A failed write (network blip) leaves the flag clear so the
 * next server render that still disagrees gets another attempt. Renders
 * nothing.
 */
export function TimezoneSync({ timezone }: { timezone: string }) {
  const router = useRouter()
  const synced = useRef(false)

  useEffect(() => {
    if (synced.current) {
      return
    }
    const browserTimezone = getBrowserTimezone()
    if (
      browserTimezone === timezone ||
      resolveFilterTimezone(browserTimezone) !== browserTimezone
    ) {
      return
    }
    // Set before the await so Strict Mode's double effect cannot fire twice.
    synced.current = true
    startTransition(async () => {
      try {
        await setUserTimezone(browserTimezone)
      } catch {
        // Best-effort background sync: the page already works in the
        // fallback zone, so surface nothing and retry on a later render.
        synced.current = false
        return
      }
      router.refresh()
    })
  }, [timezone, router])

  return null
}
