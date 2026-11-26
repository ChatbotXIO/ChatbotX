"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangleIcon,
  Loader2Icon,
  RefreshCwIcon,
  ShieldCheckIcon,
  UnplugIcon,
} from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import type { z } from "zod"
import { invalidatePublishDestinations } from "@/features/social-posts/lib/invalidate-publish-destinations"
import { orpc } from "@/lib/orpc/query"
import { LOGIN_STATUS_TONES } from "../lib/connections"
import type { socialAccountResource } from "../schema"
import { ConnectButton } from "./connect-button"
import { PageAvatar } from "./page-avatar"

type SocialAccount = z.infer<typeof socialAccountResource>

/**
 * One connected login with its actions: verify the token, re-list its pages,
 * reconnect (the same network connect as everywhere on the page) or disconnect.
 * Only a super admin reconnects or disconnects; a blocked workspace is read-only.
 */
export const SocialLoginRow = ({
  account,
  canManage,
  connectable,
  readOnly,
  workspaceId,
}: {
  account: SocialAccount
  canManage: boolean
  connectable: boolean
  readOnly: boolean
  workspaceId: string
}) => {
  const t = useTranslations()
  const format = useFormatter()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  // The login list and the page list both read this account.
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: orpc.socialAccountsAPIs.privateListSocialAccountsAPI.key(),
      }),
      invalidatePublishDestinations(queryClient),
    ])
  }
  const onError = (error: { message: string }) => toast.error(error.message)

  const verify = useMutation(
    orpc.socialAccountsAPIs.privateVerifySocialAccountAPI.mutationOptions({
      onError,
      onSuccess: async () => {
        toast.success(t("posts.connect.verified"))
        await refresh()
      },
    }),
  )
  const sync = useMutation(
    orpc.socialAccountsAPIs.privateSyncSocialAccountDestinationsAPI.mutationOptions(
      {
        onError,
        onSuccess: async () => {
          toast.success(t("posts.connect.destinationsSynced"))
          await refresh()
        },
      },
    ),
  )
  const disconnect = useMutation(
    orpc.socialAccountsAPIs.privateDisconnectSocialAccountAPI.mutationOptions({
      onError,
      onSuccess: async () => {
        toast.success(t("posts.connect.disconnected"))
        await refresh()
      },
    }),
  )

  const needsReconnect =
    account.status === "needsReauth" || account.missingScopes.length > 0
  const busy = verify.isPending || sync.isPending || disconnect.isPending
  const name =
    account.displayName || account.username || account.externalAccountId

  return (
    <li className="space-y-2 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-3">
        <PageAvatar avatar={account.avatar} className="size-9" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sm">{name}</p>
          <p className="truncate text-muted-foreground text-xs">
            {t("posts.connect.pageCount", {
              count: account.destinations.filter((d) => d.isActive).length,
            })}
            {account.lastVerifiedAt
              ? ` · ${t("posts.connect.lastVerified", {
                  date: format.dateTime(account.lastVerifiedAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }),
                })}`
              : ""}
          </p>
        </div>
        <Badge className={cn("border-0", LOGIN_STATUS_TONES[account.status])}>
          {t(`posts.connect.status.${account.status}`)}
        </Badge>
      </div>
      {account.statusReason ? (
        <p className="text-muted-foreground text-xs">
          {t(`posts.connect.reason.${account.statusReason}`)}
        </p>
      ) : null}
      {account.missingScopes.length > 0 ? (
        <p className="flex items-start gap-2 text-amber-700 text-xs dark:text-amber-400">
          <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
          {t("posts.connect.missingScopes", {
            scopes: account.missingScopes.join(", "),
          })}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {canManage ? (
          <ConnectButton
            connectable={connectable}
            disabled={readOnly || busy}
            label={t("posts.connect.reconnect")}
            provider={account.provider}
            variant={needsReconnect ? "default" : "outline"}
            workspaceId={workspaceId}
          />
        ) : null}
        {canManage ? (
          <>
            <Button
              disabled={readOnly || busy || account.status === "disconnected"}
              onClick={() => verify.mutate({ id: account.id, workspaceId })}
              size="sm"
              variant="outline"
            >
              {verify.isPending ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <ShieldCheckIcon />
              )}
              {t("posts.connect.verify")}
            </Button>
            <Button
              disabled={readOnly || busy || account.status !== "connected"}
              onClick={() => sync.mutate({ id: account.id, workspaceId })}
              size="sm"
              variant="outline"
            >
              {sync.isPending ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <RefreshCwIcon />
              )}
              {t("posts.connect.syncDestinations")}
            </Button>
          </>
        ) : null}
        {canManage && account.status !== "disconnected" ? (
          <Button
            className={cn(confirming && "text-destructive")}
            disabled={readOnly || busy}
            onBlur={() => setConfirming(false)}
            onClick={() => {
              if (confirming) {
                disconnect.mutate({ id: account.id, workspaceId })
              }
              setConfirming((value) => !value)
            }}
            size="sm"
            variant="ghost"
          >
            <UnplugIcon />
            {confirming
              ? t("posts.connect.confirmDisconnect")
              : t("posts.connect.disconnect")}
          </Button>
        ) : null}
      </div>
    </li>
  )
}
