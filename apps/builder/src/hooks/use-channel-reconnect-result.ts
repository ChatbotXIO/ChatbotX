"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { toast } from "sonner"
import { RECONNECT_ERROR_REASONS } from "@/lib/channel-reconnect"

/**
 * Surface the outcome of an OAuth reconnect (see `@/lib/channel-reconnect`)
 * when the callback redirects back with `?reconnect=success|error&reason=...`.
 * Mirrors `useChannelDuplicatedError`.
 */
export function useChannelReconnectResult() {
  const t = useTranslations("channels")
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const result = searchParams.get("reconnect")
    if (result !== "success" && result !== "error") {
      return
    }

    const reason = searchParams.get("reason")
    const params = new URLSearchParams(searchParams.toString())
    params.delete("reconnect")
    params.delete("reason")
    const qs = params.size > 0 ? `?${params.toString()}` : ""

    const timer = setTimeout(() => {
      if (result === "success") {
        toast.success(t("reconnect.success"))
      } else {
        const knownReason = RECONNECT_ERROR_REASONS.find(
          (candidate) => candidate === reason,
        )
        toast.error(t(`reconnect.errors.${knownReason ?? "failed"}`))
      }
      router.replace(`${window.location.pathname}${qs}`, { scroll: false })
    }, 0)

    return () => clearTimeout(timer)
  }, [searchParams, t, router])
}
