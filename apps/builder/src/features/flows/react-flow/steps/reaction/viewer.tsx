"use client"

import type { ReactionStepSchema } from "@chatbotx.io/flow-config"
import { useTranslations } from "next-intl"

type ReactionStepViewerProps = {
  data: ReactionStepSchema
}

export default function ReactionStepViewer(props: ReactionStepViewerProps) {
  const t = useTranslations()

  return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm">
      <span className="text-base">{props.data.emoji || "👍"}</span>
      <span>
        {t("flows.fields.reactionPreviewText", {
          emoji: props.data.emoji || "👍",
        })}
      </span>
    </div>
  )
}
