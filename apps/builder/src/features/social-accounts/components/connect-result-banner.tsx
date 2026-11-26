"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { useQueryClient } from "@tanstack/react-query"
import { AlertTriangleIcon, CheckCircle2Icon } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { invalidatePublishDestinations } from "@/features/social-posts/lib/invalidate-publish-destinations"
import {
  RECONNECT_ERROR_KEYS,
  readReconnectOutcome,
} from "../lib/reconnect-result"
import { readSocialConnectResult } from "../lib/social-connect-result"

/**
 * The outcome of the last reconnect or TikTok connect, read off the URL the
 * OAuth callback returned to. A reconnect also refreshes the destinations, so
 * the chips show the new state.
 */
export const ConnectResultBanner = () => {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const reconnect = readReconnectOutcome(searchParams)
  const connect = readSocialConnectResult(searchParams)
  const hasReconnect = reconnect !== null

  useEffect(() => {
    if (hasReconnect) {
      invalidatePublishDestinations(queryClient)
    }
  }, [hasReconnect, queryClient])

  let ok: boolean
  let message: string
  if (reconnect) {
    ok = reconnect.ok
    message = reconnect.ok
      ? t("channels.reconnect.success")
      : t(RECONNECT_ERROR_KEYS[reconnect.reason])
  } else if (connect) {
    ok = connect.ok
    message = connect.ok
      ? t("socialAccounts.connectResult.success")
      : t(`socialAccounts.connectResult.${connect.reason ?? "failed"}`, {
          permissions: connect.missingPermissions.join(", "),
        })
  } else {
    return null
  }

  return (
    <p
      className={cn(
        "flex items-center gap-2 rounded-xl border p-3 text-sm",
        ok
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-destructive/40 bg-destructive/5",
      )}
      role="status"
    >
      {ok ? (
        <CheckCircle2Icon className="size-4 shrink-0 text-emerald-500" />
      ) : (
        <AlertTriangleIcon className="size-4 shrink-0 text-destructive" />
      )}
      {message}
    </p>
  )
}
