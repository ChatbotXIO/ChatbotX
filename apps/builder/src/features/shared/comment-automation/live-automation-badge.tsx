"use client"

import type { CommentPost } from "@chatbotx.io/database/partials"
import { isLiveCommentAutomation } from "@chatbotx.io/database/partials"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { useTranslations } from "next-intl"

/** Marks a Live automation in a list that mixes Live and post automations. */
export function LiveAutomationBadge({ post }: { post: CommentPost }) {
  const t = useTranslations("commentAutomation")
  if (!isLiveCommentAutomation(post)) {
    return null
  }
  return (
    <Badge className="ml-2 align-middle" variant="destructive">
      {t("liveBadge")}
    </Badge>
  )
}
