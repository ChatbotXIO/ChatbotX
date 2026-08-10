"use client"

import { Loader2Icon, RefreshCwIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { refreshAllChannelTokensAction } from "../actions/refresh-all-channel-tokens.action"

export function RefreshAllChannelTokensButton() {
  const t = useTranslations()

  const { execute, isPending } = useAction(refreshAllChannelTokensAction, {
    onSuccess: ({ data }) => {
      if (!data) {
        return
      }
      if (data.failed > 0) {
        toast.warning(
          t("channels.refreshAllTokens.resultWithFailures", {
            refreshed: data.refreshed,
            failed: data.failed,
          }),
        )
      } else {
        toast.success(
          t("channels.refreshAllTokens.resultSuccess", {
            refreshed: data.refreshed,
          }),
        )
      }
    },
    onError: ({ error }) => {
      if (error.serverError) {
        toast.error(error.serverError)
      }
    },
  })

  return (
    <button
      className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-start text-sm outline-hidden transition-colors focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0"
      disabled={isPending}
      onClick={() => execute()}
      type="button"
    >
      {isPending ? (
        <Loader2Icon aria-hidden className="animate-spin" />
      ) : (
        <RefreshCwIcon aria-hidden />
      )}
      {t("channels.refreshAllTokens.button")}
    </button>
  )
}
