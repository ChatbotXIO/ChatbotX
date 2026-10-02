"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@chatbotx.io/ui/components/ui/alert"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { WifiOffIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useWorkspaceRealtimeContext } from "@/features/realtime/workspace-realtime-provider"

/** Avoids flashing the banner during a normal first connect or a brief,
 * self-healing reconnect — only a connection that's stayed non-open this
 * long is worth interrupting the user for. See PR #1349 finding #5. */
const CONNECTION_BANNER_GRACE_PERIOD_MS = 10_000

const handleReload = (): void => {
  window.location.reload()
}

/** Surfaces the single workspace socket's connection trouble instead of
 * leaving the user staring at a silently stale inbox. `"closed"` is terminal
 * (the token mint was unauthorized, or the socket gave up) and needs a
 * reload; `"connecting"`/`"resyncing"` past the grace period are still
 * retrying in the background, so the copy doesn't ask for a reload. */
export function WorkspaceRealtimeStatusBanner() {
  const { status } = useWorkspaceRealtimeContext()
  const t = useTranslations("realtime.connectionBanner")
  const [pastGracePeriod, setPastGracePeriod] = useState(false)

  useEffect(() => {
    if (status === "open") {
      setPastGracePeriod(false)
      return
    }
    const timer = setTimeout(() => {
      setPastGracePeriod(true)
    }, CONNECTION_BANNER_GRACE_PERIOD_MS)
    return () => clearTimeout(timer)
  }, [status])

  if (status === "open" || !pastGracePeriod) {
    return null
  }

  return (
    <Alert className="border-amber-500/40 bg-amber-500/5" variant="warning">
      <WifiOffIcon />
      <AlertTitle>
        {status === "closed" ? t("closedTitle") : t("reconnectingTitle")}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>
          {status === "closed"
            ? t("closedDescription")
            : t("reconnectingDescription")}
        </p>
        {status === "closed" && (
          <Button
            aria-label={t("reload")}
            onClick={handleReload}
            size="sm"
            variant="outline"
          >
            {t("reload")}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
