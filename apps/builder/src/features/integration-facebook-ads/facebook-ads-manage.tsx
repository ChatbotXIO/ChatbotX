"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { SettingRow } from "@/components/setting-row"
import { connectFacebookAds } from "./actions/connect.action"
import { disconnectFacebookAds } from "./actions/disconnect.action"
import type { IntegrationFacebookAdsResource } from "./schemas"

type FacebookAdsManageProps = {
  workspaceId: string
  integrationFacebookAds: IntegrationFacebookAdsResource | undefined
}

const needsReconnect = (
  integration: IntegrationFacebookAdsResource,
): boolean => {
  if (integration.status === "invalid") {
    return true
  }
  return Boolean(
    integration.tokenExpiresAt &&
      new Date(integration.tokenExpiresAt).getTime() < Date.now(),
  )
}

export function FacebookAdsManage({
  workspaceId,
  integrationFacebookAds,
}: FacebookAdsManageProps) {
  const router = useRouter()
  const t = useTranslations()

  const { executeAsync: onConnect, isPending: isPendingConnect } = useAction(
    connectFacebookAds.bind(null, workspaceId),
    {
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )
  const { executeAsync: onDisconnect, isPending: isPendingDisconnect } =
    useAction(disconnectFacebookAds.bind(null, workspaceId), {
      onSuccess: () => {
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    })

  return (
    <SettingRow
      description={t("facebookAds.setting.description")}
      label={t("facebookAds.setting.label")}
    >
      {integrationFacebookAds ? (
        <div className="flex flex-col gap-2">
          {needsReconnect(integrationFacebookAds) && (
            <Button
              disabled={isPendingConnect}
              onClick={async (e) => {
                e.preventDefault()
                await onConnect()
              }}
              size="sm"
              variant="secondary"
            >
              {isPendingConnect && <Loader2Icon className="animate-spin" />}
              {t("facebookAds.setting.reconnect")}
            </Button>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive">
                {t("actions.disconnect")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("messages.disconnectFeature", {
                    feature: t("facebookAds.title"),
                  })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("messages.disconnectFeatureDescription", {
                    feature: t("facebookAds.title"),
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  disabled={isPendingDisconnect}
                  onClick={async (e) => {
                    e.preventDefault()
                    await onDisconnect()
                  }}
                >
                  {isPendingDisconnect && (
                    <Loader2Icon className="animate-spin" />
                  )}
                  {t("actions.disconnect")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : (
        <Button
          disabled={isPendingConnect}
          onClick={async (e) => {
            e.preventDefault()
            await onConnect()
          }}
          size="sm"
          variant="secondary"
        >
          {isPendingConnect && <Loader2Icon className="animate-spin" />}
          {t("actions.connect")}
        </Button>
      )}
    </SettingRow>
  )
}
