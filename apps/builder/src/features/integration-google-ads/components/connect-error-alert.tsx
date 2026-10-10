"use client"

import type { ConnectErrorQueryCode } from "@chatbotx.io/utils/connection"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { googleAdsSettingsPathWithoutConnectError } from "../lib/constants"
import { connectErrorKey } from "../lib/status"
import { NoticeAlert } from "./notice-alert"

type ConnectErrorAlertProps = {
  workspaceId: string
  /** Why the connect attempt that just returned to this page did not finish. */
  code: ConnectErrorQueryCode
}

/** Explicit, translated reason a Google Ads connect failed, that can be dismissed (the Connect button on the page retries). */
export const ConnectErrorAlert = ({
  workspaceId,
  code,
}: ConnectErrorAlertProps) => {
  const t = useTranslations()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isDismissed, setIsDismissed] = useState(false)

  if (isDismissed) {
    return null
  }
  // Drop `?connect_error=` so a refresh cannot resurrect a dismissed error.
  const clearParam = () =>
    router.replace(
      googleAdsSettingsPathWithoutConnectError(workspaceId, searchParams),
    )

  return (
    <NoticeAlert
      dismissLabel={t("googleAds.picker.dismiss")}
      onDismiss={() => {
        setIsDismissed(true)
        clearParam()
      }}
      title={t("googleAds.picker.connectErrorTitle")}
      tone="destructive"
    >
      <p>{t(connectErrorKey[code])}</p>
    </NoticeAlert>
  )
}
