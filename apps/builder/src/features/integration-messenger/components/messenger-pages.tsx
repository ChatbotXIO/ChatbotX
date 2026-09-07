"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@chatbotx.io/ui/components/ui/alert"
import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { ConnectPickerScreen } from "@/features/channel-connect/components/connect-picker-screen"
import { connectViaApi } from "@/features/channel-connect/lib/connect-client"
import type { ConnectPickerItem } from "@/features/channel-connect/lib/picker-items"
import {
  CONNECT_CHANNEL_REGISTRY,
  CONNECT_RETRY_HREF,
} from "@/features/channel-connect/lib/registry"
import { connectActionResultSchemaDefault } from "@/features/channel-connect/schema"

/**
 * `ConnectPickerItem` plus the raw provider flags this component needs to
 * decide which warning alert to show — kept as booleans instead of
 * re-deriving the decision from `disabledReason`'s (translated, therefore
 * unstable) display text.
 */
export type MessengerPickerItem = ConnectPickerItem & {
  isConnectable: boolean
  isAlreadyConnected: boolean
}

export function MessengerPages({
  workspaceId,
  items,
}: {
  workspaceId: string
  items: MessengerPickerItem[]
}) {
  const t = useTranslations()

  // The oRPC route, not the server action: Next serializes server actions
  // from one browser, so the batch could only ever connect one page at a
  // time (`CONNECT_CONCURRENCY` is what this buys).
  const connectOne = (item: MessengerPickerItem) =>
    connectViaApi({
      route: CONNECT_CHANNEL_REGISTRY.messenger.connectRoute,
      body: { pageId: item.id },
      parse: (data) => connectActionResultSchemaDefault.parse(data),
      item,
    })

  // A page with no selectable rows only happens when every page is either
  // not-admin or already connected — the row-level note already explains
  // each case, so this warning only fires for the not-admin reason so it
  // doesn't duplicate a purely "already connected" list's own explanation.
  const hasSelectablePage = items.some(
    (item) => item.isConnectable && !item.isAlreadyConnected,
  )
  const showNotAdminWarning =
    !hasSelectablePage &&
    items.some((item) => !(item.isConnectable || item.isAlreadyConnected))

  return (
    <ConnectPickerScreen
      channel="messenger"
      connectOne={connectOne}
      extraAlert={
        showNotAdminWarning && (
          <Alert variant="warning">
            <AlertTitle>
              {t("messenger.selectPage.noConnectablePagesTitle")}
            </AlertTitle>
            <AlertDescription>
              <p>{t("messenger.selectPage.noConnectablePagesDescription")}</p>
              <Link
                className={buttonVariants({ size: "sm" })}
                href={CONNECT_RETRY_HREF}
              >
                {t("messenger.selectPage.tryAgain")}
              </Link>
            </AlertDescription>
          </Alert>
        )
      }
      idsFieldName="pageIds"
      items={items}
      workspaceId={workspaceId}
    />
  )
}
