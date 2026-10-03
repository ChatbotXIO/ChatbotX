"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { useTranslations } from "next-intl"
import { useState } from "react"
import {
  AutomationTypeCard,
  AutomationTypeCardGrid,
  FacebookTileIcon,
  InstagramTileIcon,
  LiveTileIcon,
} from "@/features/shared/comment-automation/automation-type-cards"
import { LIVE_POST_TYPE_PARAM } from "@/features/shared/comment-automation/lib/live-post-type"
import type { IgCommentVariant } from "../schema/action"

/**
 * Two steps in one dialog: first the Instagram connection type (it decides
 * which API the automation runs on), then what to automate — a live broadcast
 * or posts and reels.
 */
export function SelectInstagramConnectionTypeDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const [variant, setVariant] = useState<IgCommentVariant | null>(null)

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setVariant(null)
    }
    onOpenChange(next)
  }

  const createHref = variant
    ? `/space/${workspaceId}/ig-comments/create?variant=${variant}`
    : null

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {createHref
              ? t("commentAutomation.postTypeDialog.title")
              : t("instagramCommentAutomation.connectionType.title")}
          </DialogTitle>
        </DialogHeader>
        {createHref ? (
          <AutomationTypeCardGrid>
            <AutomationTypeCard
              continueLabel={t("actions.continue")}
              description={t(
                "instagramCommentAutomation.postTypeDialog.liveDescription",
              )}
              href={`${createHref}&postType=${LIVE_POST_TYPE_PARAM}`}
              icon={<LiveTileIcon />}
              title={t("instagramCommentAutomation.postTypeDialog.liveTitle")}
            />
            <AutomationTypeCard
              continueLabel={t("actions.continue")}
              description={t(
                "instagramCommentAutomation.postTypeDialog.postsDescription",
              )}
              href={createHref}
              icon={<InstagramTileIcon />}
              title={t("instagramCommentAutomation.postTypeDialog.postsTitle")}
            />
          </AutomationTypeCardGrid>
        ) : (
          <AutomationTypeCardGrid>
            <AutomationTypeCard
              continueLabel={t("actions.continue")}
              description={t(
                "instagramCommentAutomation.connectionType.instagramDescription",
              )}
              icon={<InstagramTileIcon />}
              onSelect={() => setVariant("instagram")}
              title={t(
                "instagramCommentAutomation.connectionType.instagramTitle",
              )}
            />
            <AutomationTypeCard
              continueLabel={t("actions.continue")}
              description={t(
                "instagramCommentAutomation.connectionType.instagramFacebookDescription",
              )}
              icon={<FacebookTileIcon />}
              onSelect={() => setVariant("instagramFacebook")}
              title={t(
                "instagramCommentAutomation.connectionType.instagramFacebookTitle",
              )}
            />
          </AutomationTypeCardGrid>
        )}
      </DialogContent>
    </Dialog>
  )
}
