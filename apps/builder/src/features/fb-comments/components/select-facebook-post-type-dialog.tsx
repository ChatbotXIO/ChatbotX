"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { useTranslations } from "next-intl"
import {
  AutomationTypeCard,
  AutomationTypeCardGrid,
  FacebookTileIcon,
  LiveTileIcon,
} from "@/features/shared/comment-automation/automation-type-cards"
import { LIVE_POST_TYPE_PARAM } from "@/features/shared/comment-automation/lib/live-post-type"

export function SelectFacebookPostTypeDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const createHref = `/space/${workspaceId}/fb-comments/create`

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("commentAutomation.postTypeDialog.title")}
          </DialogTitle>
        </DialogHeader>
        <AutomationTypeCardGrid>
          <AutomationTypeCard
            continueLabel={t("actions.continue")}
            description={t(
              "facebookCommentAutomation.postTypeDialog.liveDescription",
            )}
            href={`${createHref}?postType=${LIVE_POST_TYPE_PARAM}`}
            icon={<LiveTileIcon />}
            title={t("facebookCommentAutomation.postTypeDialog.liveTitle")}
          />
          <AutomationTypeCard
            continueLabel={t("actions.continue")}
            description={t(
              "facebookCommentAutomation.postTypeDialog.postsDescription",
            )}
            href={createHref}
            icon={<FacebookTileIcon />}
            title={t("facebookCommentAutomation.postTypeDialog.postsTitle")}
          />
        </AutomationTypeCardGrid>
      </DialogContent>
    </Dialog>
  )
}
