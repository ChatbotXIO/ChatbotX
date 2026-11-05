"use client"

import { usePathname } from "next/navigation"
import { useEffect } from "react"
import { clearTemplateInstallIntentAction } from "../actions/template-install-intent.action"
import {
  INSTALL_INTENT_MARKER_COOKIE,
  isChannelFlowPath,
} from "../lib/install-intent-marker"

const hasMarker = (): boolean =>
  document.cookie
    .split("; ")
    .some((cookie) => cookie.startsWith(`${INSTALL_INTENT_MARKER_COOKIE}=`))

/** Leaving the channel flow ends a share page's pending choice. */
export function TemplateInstallIntentGuard() {
  const pathname = usePathname()

  useEffect(() => {
    if (hasMarker() && !isChannelFlowPath(pathname)) {
      // Best effort: the choice expires by itself within minutes.
      clearTemplateInstallIntentAction().catch(() => undefined)
    }
  }, [pathname])

  return null
}
