"use client"

import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import {
  CoexistOptionsPanel,
  coexistRowTrailing,
} from "@/features/channel-connect/components/coexist-controls"
import { renderConnectFlowOverlay } from "@/features/channel-connect/components/connect-picker-screen"
import { ConnectSessionErrorAlert } from "@/features/channel-connect/components/connect-session-error-alert"
import { useConnectFlow } from "@/features/channel-connect/hooks/use-connect-flow"
import { connectViaApi } from "@/features/channel-connect/lib/connect-client"
import type { ConnectTarget } from "@/features/channel-connect/lib/picker-items"
import {
  CONNECT_CHANNEL_REGISTRY,
  INSTAGRAM_DIRECT_CONNECT_ROUTE,
} from "@/features/channel-connect/lib/registry"
import { connectActionResultSchemaDefault } from "@/features/channel-connect/schema"

/** The one account a direct-login `ConnectSession` offers — `session.targets[0]`, the public projection (no username/access token). */
export type InstagramDirectAccount = {
  id: string
  name: string
  avatarUrl?: string
}

/**
 * Instagram direct-login connect: a single account, so it always goes
 * through `useConnectFlow`'s single-item path (inline spinner, then the
 * coexist call when the account's own switch asked for one) — never the
 * multi-select batch dialog.
 *
 * Scope note: the account's `username` is no longer displayed — it lived
 * only in the pending-auth cookie's live re-fetch, and the unified session
 * model's public `session.targets` projection doesn't carry it (by design,
 * the same projection every picker shares). A cosmetic-only regression.
 */
export function InstagramAccounts({
  sessionId,
  workspaceId,
  account,
}: {
  sessionId: string
  workspaceId: string
  account: InstagramDirectAccount
}) {
  const t = useTranslations()
  const router = useRouter()
  // The same two per-row opt-ins the multi-select picker renders, for the one
  // account this screen ever shows.
  const [syncHistory, setSyncHistory] = useState(false)
  const [aiReadsSyncedHistory, setAiReadsSyncedHistory] = useState(false)

  const settingsHref = `/space/${workspaceId}/settings/channels/instagram`

  // The oRPC route, not the server action — one shared transport for every
  // picker surface (`INSTAGRAM_DIRECT_CONNECT_ROUTE`: this login connects the
  // one account behind its own pending auth, so it has no picker entry).
  const connectOne = (item: ConnectTarget) =>
    connectViaApi({
      route: INSTAGRAM_DIRECT_CONNECT_ROUTE,
      body: { sessionId, igId: item.id },
      parse: (data) => connectActionResultSchemaDefault.parse(data),
      item,
    })

  const flow = useConnectFlow<ConnectTarget>({
    channel: "instagram",
    connectOne,
    onFinished: () => {
      router.push(settingsHref)
    },
    resolveCoexistWorkspaceId: () => workspaceId,
  })

  const overlay = renderConnectFlowOverlay({
    channel: "instagram",
    connectOne,
    flow,
    workspaceId,
  })
  if (overlay) {
    return overlay
  }

  return (
    <div className="space-y-6">
      {flow.state.kind === "singleSessionError" && (
        <ConnectSessionErrorAlert channel="instagram" code={flow.state.code} />
      )}

      <div className="flex items-center gap-3 rounded-lg border p-4">
        {account.avatarUrl && (
          <Image
            alt={account.name}
            className="size-12 rounded-full object-cover"
            height={48}
            src={account.avatarUrl}
            width={48}
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium">{account.name}</p>
        </div>
        {/* The same trailing column (and the same reveal rule) the
            multi-select pickers render, for the one account this screen
            ever shows. */}
        {coexistRowTrailing({
          aiReadsSyncedHistory,
          onAiReadsSyncedHistoryChange: setAiReadsSyncedHistory,
          onSyncChange: setSyncHistory,
          row: { name: account.name },
          syncing: syncHistory,
        })}
      </div>

      {syncHistory && (
        <CoexistOptionsPanel
          descriptionKey={
            CONNECT_CHANNEL_REGISTRY.instagram.coexistDescriptionKey
          }
        />
      )}

      <div className="flex justify-end gap-2">
        <Link
          className={buttonVariants({ size: "sm", variant: "ghost" })}
          href={settingsHref}
        >
          {t("actions.cancel")}
        </Link>
        <Button
          disabled={flow.state.kind === "connectingSingle"}
          onClick={() =>
            flow.start([
              {
                id: account.id,
                name: account.name,
                aiReadsSyncedHistory,
                coexist: syncHistory,
              },
            ])
          }
          type="button"
        >
          {flow.state.kind === "connectingSingle" && (
            <Loader2Icon className="animate-spin" />
          )}
          {t("actions.continue")}
        </Button>
      </div>
    </div>
  )
}
