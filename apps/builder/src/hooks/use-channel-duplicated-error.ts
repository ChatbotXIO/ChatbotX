"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { toast } from "sonner"

export function useChannelDuplicatedError(channel?: string) {
  const t = useTranslations("channels")
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    if (searchParams.get("error") !== "duplicated") {
      return
    }

    const key = channel ? `duplicated.${channel}` : "duplicated.generic"
    const params = new URLSearchParams(searchParams.toString())
    params.delete("error")
    const qs = params.size > 0 ? `?${params.toString()}` : ""

    const timer = setTimeout(() => {
      toast.error(t(key as Parameters<typeof t>[0]))
      router.replace(`${window.location.pathname}${qs}`, { scroll: false })
    }, 0)

    return () => clearTimeout(timer)
  }, [searchParams, t, router, channel])
}
