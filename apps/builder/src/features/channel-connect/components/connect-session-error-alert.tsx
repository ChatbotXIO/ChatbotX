"use client"

import type { ConnectSessionErrorCode } from "@chatbotx.io/business/inbox/connect-outcome-types"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@chatbotx.io/ui/components/ui/alert"
import Link from "next/link"
import { useTranslations } from "next-intl"
import {
  CONNECT_CHANNEL_REGISTRY,
  CONNECT_RETRY_HREF,
  type ConnectPickerChannel,
} from "../lib/registry"
import { SESSION_ERROR_MESSAGE_KEYS } from "../lib/row-status"

/**
 * The single-item path's "your connect session expired" alert. One
 * implementation so every picker surface shows the same copy and the same
 * try-again destination; only the link text is per-channel, and it comes from
 * the registry rather than from a hard-coded key at each site.
 */
export function ConnectSessionErrorAlert({
  channel,
  code,
}: {
  channel: ConnectPickerChannel
  code: ConnectSessionErrorCode
}) {
  const t = useTranslations()

  return (
    <Alert variant="destructive">
      <AlertTitle>{t(SESSION_ERROR_MESSAGE_KEYS[code])}</AlertTitle>
      <AlertDescription>
        <Link
          className="underline decoration-dotted underline-offset-2"
          href={CONNECT_RETRY_HREF}
        >
          {t(CONNECT_CHANNEL_REGISTRY[channel].tryAgainKey)}
        </Link>
      </AlertDescription>
    </Alert>
  )
}
