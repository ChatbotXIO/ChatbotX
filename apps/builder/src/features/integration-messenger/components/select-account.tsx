"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@chatbotx.io/ui/components/ui/alert"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useTranslations } from "next-intl"
import { CONNECT_PICKER_CARD_CLASS } from "@/features/channel-connect/components/connect-picker-card"
import type { MessengerPickerItem } from "@/features/integration-messenger/components/messenger-pages"
import { MessengerPages } from "@/features/integration-messenger/components/messenger-pages"

export type PagesLoadError = {
  /**
   * Meta's own sentence (via `mapToChannelError`, which already folds
   * `error_user_msg` in). Absent when Graph never answered — timeout, DNS,
   * a malformed body — so the UI falls back to its generic copy, the same
   * split `throwWhatsappApiActionError` makes for WhatsApp.
   */
  providerMessage?: string
}

type SelectPageProps = {
  items: MessengerPickerItem[]
  bmLookupFailed: boolean
  /**
   * Set when `/me/accounts` failed outright. `items` is empty in that case,
   * so the picker's own "No Facebook Pages found" state renders under a red
   * box carrying the failure. Meta's sentence wins; the generic copy is only
   * for failures where Facebook never answered.
   */
  loadError?: PagesLoadError
  workspaceId: string
}

export function SelectPage({
  items,
  bmLookupFailed,
  loadError,
  workspaceId,
}: SelectPageProps) {
  const t = useTranslations()

  return (
    <Card className={CONNECT_PICKER_CARD_CLASS}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>
          {t("actions.connectFeature", { feature: "Messenger" })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError !== undefined && (
          <Alert role="alert" variant="destructive">
            <AlertDescription>
              {loadError.providerMessage ??
                t("messenger.selectPage.loadFailed")}
            </AlertDescription>
          </Alert>
        )}
        {bmLookupFailed && (
          <Alert variant="warning">
            <AlertTitle>
              {t("messenger.selectPage.bmLookupFailedTitle")}
            </AlertTitle>
            <AlertDescription>
              {t("messenger.selectPage.bmLookupFailedDescription")}
            </AlertDescription>
          </Alert>
        )}
        <MessengerPages items={items} workspaceId={workspaceId} />
      </CardContent>
    </Card>
  )
}
