"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { Loader2Icon, RefreshCwIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import {
  refreshTiktokCommentToMessageAction,
  toggleTiktokCommentToMessageAction,
} from "../actions/comment-to-message.action"
import type { IntegrationTiktokResource } from "../schema/resource"

/**
 * The Comment-to-Message switch for one connected TikTok account.
 *
 * `null` status means the setting has never been read back from TikTok — every
 * connection made before this shipped is in that state, and the owner may well
 * have enabled it in the TikTok app. It renders as off with a hint and a
 * re-check button rather than as a confident "disabled".
 */
export function TiktokCommentToMessage({
  integrationTiktok,
}: {
  integrationTiktok: IntegrationTiktokResource
}) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const [status, setStatus] = useState(integrationTiktok.commentToMessageStatus)

  const { execute: toggle, isPending: isToggling } = useAction(
    toggleTiktokCommentToMessageAction.bind(
      null,
      workspaceId,
      integrationTiktok.id,
    ),
    {
      onSuccess: ({ data }) => {
        setStatus(data?.status ?? null)
        toast.success(t("messages.updatedSuccess"))
      },
      onError: ({ error }) => {
        // TikTok's own eligibility wording is the only thing that says which
        // rule the account failed, so it goes to the toast unaltered.
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const { execute: refresh, isPending: isRefreshing } = useAction(
    refreshTiktokCommentToMessageAction.bind(
      null,
      workspaceId,
      integrationTiktok.id,
    ),
    {
      onSuccess: ({ data }) => {
        setStatus(data?.status ?? null)
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const isPending = isToggling || isRefreshing

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger>
          <div className="flex items-center gap-2">
            <Switch
              checked={status === "ENABLE"}
              disabled={isPending}
              onCheckedChange={(enabled) => toggle({ enabled })}
            />
            <span className="text-muted-foreground text-xs">
              {t("fields.tiktok.commentToMessage")}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p>{t("fields.tiktok.commentToMessageDescription")}</p>
          <p className="mt-1">
            {t("fields.tiktok.commentToMessageEligibility")}
          </p>
          {status === null && (
            <p className="mt-1">{t("fields.tiktok.commentToMessageUnknown")}</p>
          )}
        </TooltipContent>
      </Tooltip>
      <Button
        disabled={isPending}
        onClick={() => refresh()}
        size="icon"
        variant="ghost"
      >
        {isRefreshing ? (
          <Loader2Icon className="animate-spin" />
        ) : (
          <RefreshCwIcon />
        )}
      </Button>
    </div>
  )
}
