"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@chatbotx.io/ui/components/ui/alert"
import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { isCoexistChannel } from "@chatbotx.io/utils/channel"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import {
  type UseConnectFlowResult,
  useConnectFlow,
} from "../hooks/use-connect-flow"
import type { MessageKey } from "../lib/message-key"
import type { ConnectPickerItem } from "../lib/picker-items"
import {
  CONNECT_CHANNEL_REGISTRY,
  CONNECT_RETRY_HREF,
  type ConnectPickerChannel,
} from "../lib/registry"
import type { ConnectActionResultWire } from "../schema"
import {
  type ConnectDialogExtraStep,
  ConnectManyDialog,
} from "./connect-many-dialog"
import { ConnectSelectionForm } from "./connect-selection-form"
import { ConnectSessionErrorAlert } from "./connect-session-error-alert"

/**
 * Channels whose picker screen goes through `ConnectPickerScreen` — narrower
 * than `ConnectPickerChannel` because it also indexes
 * `CONNECT_CHANNEL_REGISTRY`'s (optional) `emptyTitleKey`/`emptyDescriptionKey`,
 * which not every channel defines yet. Derived from the registry itself
 * (never a hard-coded channel list — the one hard-coded list in this
 * feature lives in `lib/registry.ts`), so a new channel that adds both keys
 * is picked up automatically and one that doesn't still fails to type-check
 * if passed here. Not imported outside this file — callers pass a channel
 * literal and this type only narrows it locally.
 */
type ConnectPickerScreenChannel = {
  [K in ConnectPickerChannel]: (typeof CONNECT_CHANNEL_REGISTRY)[K] extends {
    emptyTitleKey: MessageKey
    emptyDescriptionKey: MessageKey
  }
    ? K
    : never
}[ConnectPickerChannel]

export type RenderConnectFlowOverlayOptions<TItem extends ConnectPickerItem> = {
  channel: ConnectPickerChannel
  workspaceId: string
  flow: UseConnectFlowResult<TItem>
  connectOne: (item: TItem) => Promise<ConnectActionResultWire>
  /** Channel-supplied steps appended after "connecting" (WhatsApp verification/manualResult). */
  extraSteps?: ConnectDialogExtraStep[]
  /** WhatsApp only — its workspace only exists once a number has connected. */
  resolveCoexistWorkspaceId?: () => string | undefined
}

/**
 * The one overlay state every connect flow can enter: the multi-select status
 * dialog (`flow.state.kind === "batch"`). Shared by every picker screen
 * (`ConnectPickerScreen`, `InstagramAccounts`'s single-account flow,
 * WhatsApp's card) so no caller re-copies the branch. Returns `null` when the
 * flow is in any other state, so callers can fall through to their own
 * render.
 */
export function renderConnectFlowOverlay<TItem extends ConnectPickerItem>({
  channel,
  workspaceId,
  flow,
  connectOne,
  extraSteps,
  resolveCoexistWorkspaceId,
}: RenderConnectFlowOverlayOptions<TItem>): ReactNode | null {
  if (flow.state.kind === "batch") {
    return (
      <ConnectManyDialog
        channel={channel}
        connectOne={connectOne}
        extraSteps={extraSteps}
        items={flow.state.items}
        onClose={flow.closeBatch}
        onFinished={flow.finishBatch}
        resolveCoexistWorkspaceId={resolveCoexistWorkspaceId}
        workspaceId={workspaceId}
      />
    )
  }
  return null
}

export type ConnectPickerScreenProps<
  TItem extends ConnectPickerItem,
  TFieldName extends string,
> = {
  channel: ConnectPickerScreenChannel
  workspaceId: string
  items: readonly TItem[]
  connectOne: (item: TItem) => Promise<ConnectActionResultWire>
  /** The key the caller's submit payload is keyed by, e.g. `"pageIds"`. */
  idsFieldName: TFieldName
  /** Rendered above the session-error alert and the picker form — e.g. Messenger's not-admin warning. */
  extraAlert?: ReactNode
}

/**
 * The multi-select picker screen shared by every channel whose picker is a
 * plain list of accounts to choose from (Messenger pages, Instagram-via-
 * Facebook accounts): the empty state, the batch/coexist overlay
 * (`renderConnectFlowOverlay`), the single-item session-error alert, and the
 * selection form. Per-channel copy (`emptyTitleKey`/`emptyDescriptionKey`/
 * `tryAgainKey`) comes from `CONNECT_CHANNEL_REGISTRY`, never a prop.
 */
export function ConnectPickerScreen<
  TItem extends ConnectPickerItem,
  TFieldName extends string,
>({
  channel,
  workspaceId,
  items,
  connectOne,
  idsFieldName,
  extraAlert,
}: ConnectPickerScreenProps<TItem, TFieldName>) {
  const t = useTranslations()
  const router = useRouter()
  const config = CONNECT_CHANNEL_REGISTRY[channel]
  const cancelHref = `/space/${workspaceId}/settings/channels/${config.settingsPath}`

  const flow = useConnectFlow<TItem>({
    channel,
    connectOne,
    onFinished: () => {
      router.push(cancelHref)
    },
    resolveCoexistWorkspaceId: () => workspaceId,
  })

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <Alert variant="warning">
          <AlertTitle>{t(config.emptyTitleKey)}</AlertTitle>
          <AlertDescription>{t(config.emptyDescriptionKey)}</AlertDescription>
        </Alert>
        <div className="flex justify-end gap-2">
          <Link
            className={buttonVariants({ size: "sm", variant: "ghost" })}
            href={cancelHref}
          >
            {t("actions.cancel")}
          </Link>
          <Link
            className={buttonVariants({ size: "sm" })}
            href={CONNECT_RETRY_HREF}
          >
            {t(config.tryAgainKey)}
          </Link>
        </div>
      </div>
    )
  }

  const overlay = renderConnectFlowOverlay({
    channel,
    connectOne,
    flow,
    workspaceId,
  })
  if (overlay) {
    return overlay
  }

  return (
    <div className="space-y-4">
      {flow.state.kind === "singleSessionError" && (
        <ConnectSessionErrorAlert channel={channel} code={flow.state.code} />
      )}

      {extraAlert}

      <ConnectSelectionForm
        coexist={
          isCoexistChannel(channel)
            ? { descriptionKey: config.coexistDescriptionKey }
            : undefined
        }
        idsFieldName={idsFieldName}
        isSubmitting={flow.state.kind === "connectingSingle"}
        items={items}
        onCancel={() => router.push(cancelHref)}
        onSubmit={(values) => {
          const ids: string[] = values[idsFieldName]
          const coexistIds = new Set(values.coexistIds)
          const aiIds = new Set(values.aiReadsSyncedHistoryIds)
          const selected = items
            .filter((item) => ids.includes(item.id))
            .map((item) => ({
              ...item,
              aiReadsSyncedHistory: aiIds.has(item.id),
              coexist: coexistIds.has(item.id),
            }))
          return flow.start(selected)
        }}
      />
    </div>
  )
}
