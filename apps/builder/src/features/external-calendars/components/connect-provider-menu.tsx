"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { CalendarPlusIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { connectGoogleCalendarAction } from "../actions/connect.action"

export function ConnectProviderMenu({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations()
  const { executeAsync, isPending } = useAction(
    connectGoogleCalendarAction.bind(null, workspaceId),
    {
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <Button
      disabled={isPending}
      onClick={async () => {
        await executeAsync({ referer: window.location.href })
      }}
      size="sm"
    >
      {isPending ? (
        <Loader2Icon className="size-4 animate-spin" />
      ) : (
        <CalendarPlusIcon className="size-4" />
      )}
      {t("externalCalendars.connectGoogle")}
    </Button>
  )
}
