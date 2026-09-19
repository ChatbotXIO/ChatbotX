"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { toast } from "sonner"
import {
  CHANNEL_CONNECT_ERRORS,
  type ChannelConnectError,
} from "@/lib/channel-reconnect"

/**
 * The `channels` message namespace each error code toasts from, and the copy to
 * fall back on when that namespace has no line for the caller's channel.
 *
 * Written out rather than interpolated so every key this hook can request is
 * findable by text search, and so a new error code cannot ship without copy.
 *
 * The two namespaces are deliberately NOT populated alike: `duplicated` has a
 * line per channel, while `missingScopes` has only TikTok, because TikTok's
 * callback is the only one that rejects a partial grant today. The `t.has`
 * guard below is what lets them stay uneven — a channel with no specific line
 * degrades to the generic copy instead of asking for a key that does not exist.
 */
// Keys are declared relative to the `channels` namespace this hook reads from,
// the way `t()` is called below — `i18n-source-keys.test.ts` prepends the
// namespace itself.
const MESSAGES_BY_ERROR = {
  // i18n-check t('duplicated.generic')
  duplicated: { namespace: "duplicated", fallback: "duplicated.generic" },
  // i18n-check t('missingScopes.generic')
  missingScopes: {
    namespace: "missingScopes",
    fallback: "missingScopes.generic",
  },
} as const satisfies Record<
  ChannelConnectError,
  { namespace: string; fallback: string }
>

const isChannelConnectError = (
  value: string | null,
): value is ChannelConnectError =>
  CHANNEL_CONNECT_ERRORS.includes(value as ChannelConnectError)

/**
 * Turns the `?error=` param an OAuth callback relays back into a toast, then
 * strips it so a refresh does not repeat the message.
 *
 * Every channel settings page opts in with its own channel name, which selects
 * the per-channel copy; the `generic` variant covers a caller that has none.
 */
export function useChannelConnectError(channel?: string) {
  const t = useTranslations("channels")
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const error = searchParams.get("error")
    if (!isChannelConnectError(error)) {
      return
    }

    const { namespace, fallback } = MESSAGES_BY_ERROR[error]
    const channelKey = `${namespace}.${channel}` as Parameters<typeof t>[0]
    const key =
      channel && t.has(channelKey)
        ? channelKey
        : (fallback as Parameters<typeof t>[0])

    const params = new URLSearchParams(searchParams.toString())
    params.delete("error")
    const qs = params.size > 0 ? `?${params.toString()}` : ""

    const timer = setTimeout(() => {
      toast.error(t(key))
      router.replace(`${window.location.pathname}${qs}`, { scroll: false })
    }, 0)

    return () => clearTimeout(timer)
  }, [searchParams, t, router, channel])
}
