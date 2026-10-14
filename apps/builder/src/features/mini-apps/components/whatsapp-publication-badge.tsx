"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { EyeIcon, Loader2Icon, SendIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { deleteMiniAppWhatsappDraftAction } from "../actions/delete-mini-app-whatsapp-draft.action"
import { getMiniAppWhatsappPreviewAction } from "../actions/get-mini-app-whatsapp-preview.action"
import { publishMiniAppWhatsappDraftAction } from "../actions/publish-mini-app-whatsapp-draft.action"

type WhatsappPublicationBadgeProps = {
  workspaceId: string
  miniAppId: string
  integrationWhatsappId: string
  /** The WhatsApp number's display name. */
  label: string
  /** Meta's Flow status. */
  status: string
}

/** Draft / Published label for Meta's Flow status; others show as they are. */
function useStatusLabel() {
  const t = useTranslations("miniApps.status")
  return (status: string) => {
    if (status === "DRAFT") {
      return t("draft")
    }
    if (status === "PUBLISHED") {
      return t("published")
    }
    return status
  }
}

/**
 * The Mini App's Flow on one WhatsApp number. A draft can be previewed,
 * published or deleted from Meta; a published Flow can be previewed.
 */
export function WhatsappPublicationBadge({
  workspaceId,
  miniAppId,
  integrationWhatsappId,
  label,
  status,
}: WhatsappPublicationBadgeProps) {
  const t = useTranslations("miniApps.publish")
  const statusLabel = useStatusLabel()
  const router = useRouter()
  const isDraft = status === "DRAFT"
  const input = { integrationWhatsappId }

  const preview = useAction(
    getMiniAppWhatsappPreviewAction.bind(null, workspaceId, miniAppId),
    {
      onSuccess: ({ data }) => {
        if (data?.previewUrl) {
          window.open(data.previewUrl, "_blank", "noopener,noreferrer")
        } else {
          toast.error(t("previewUnavailable"))
        }
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("failed"))
      },
    },
  )
  const publish = useAction(
    publishMiniAppWhatsappDraftAction.bind(null, workspaceId, miniAppId),
    {
      onSuccess: ({ data }) => {
        if (data?.published) {
          toast.success(t("success"))
        } else {
          toast.error(t("draftOnly"))
        }
        router.refresh()
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("failed"))
      },
    },
  )
  const deleteDraft = useAction(
    deleteMiniAppWhatsappDraftAction.bind(null, workspaceId, miniAppId),
    {
      onSuccess: () => {
        toast.success(t("draftDeleted"))
        router.refresh()
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("failed"))
        // A refused delete re-syncs the status from Meta (e.g. now live).
        router.refresh()
      },
    },
  )
  const isPending =
    preview.isPending || publish.isPending || deleteDraft.isPending

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button className="cursor-pointer" type="button">
            <Badge variant={isDraft ? "outline" : "default"}>
              {isPending ? <Loader2Icon className="animate-spin" /> : null}
              {label} · {statusLabel(status)}
            </Badge>
          </button>
        }
      />
      <DropdownMenuContent align="start">
        {isDraft ? (
          <DropdownMenuItem
            disabled={isPending}
            onClick={() => publish.execute(input)}
          >
            <SendIcon />
            {t("submit")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          disabled={isPending}
          onClick={() => preview.execute(input)}
        >
          <EyeIcon />
          {t("preview")}
        </DropdownMenuItem>
        {isDraft ? (
          <DropdownMenuItem
            disabled={isPending}
            onClick={() => deleteDraft.execute(input)}
            variant="destructive"
          >
            <Trash2Icon />
            {t("deleteDraft")}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
