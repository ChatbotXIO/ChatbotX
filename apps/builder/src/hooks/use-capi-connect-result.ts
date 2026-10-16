"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { toast } from "sonner"
import { readCapiConnectResult } from "@/features/meta-conversions/lib/capi-connect-result"

const CAPI_CONNECT_PARAMS = ["capiConnect", "capiReason"] as const

/**
 * Surfaces the outcome of the dedicated Conversions API connect when the OAuth
 * callback redirects back to the Ads tab with `?capiConnect=success|error`, then
 * strips those params so a refresh does not repeat the toast. Mirrors
 * `useChannelReconnectResult`.
 */
export function useCapiConnectResult() {
  const t = useTranslations("metaConversions")
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const result = readCapiConnectResult(searchParams)
    if (!result) {
      return
    }

    const params = new URLSearchParams(searchParams.toString())
    for (const name of CAPI_CONNECT_PARAMS) {
      params.delete(name)
    }
    const queryString = params.size > 0 ? `?${params.toString()}` : ""

    const timer = setTimeout(() => {
      if (result.status === "success") {
        toast.success(t("connect.success"))
      } else {
        toast.error(t(`connectResult.errors.${result.reason}`))
      }
      router.replace(`${window.location.pathname}${queryString}`, {
        scroll: false,
      })
    }, 0)

    return () => clearTimeout(timer)
  }, [searchParams, t, router])
}
