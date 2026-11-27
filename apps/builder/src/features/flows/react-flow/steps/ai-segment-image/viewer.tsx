"use client"

import type { AISegmentImageSchema } from "@chatbotx.io/flow-config"
import { useTranslations } from "next-intl"
import { getAiProviderLabelKey } from "@/features/ai-agents/lib/ai-provider-label"
import { AIIcon } from "../ai-generate-text/components/ai-icon"
import { StateHandle } from "../base/step-state-handles"
import { matchSelectionLabelKeys, stateLabelKeys } from "./labels"

type AISegmentImageViewerProps = {
  data: AISegmentImageSchema
}

const stateColors = {
  success: { borderClass: "border-green-500", fillClass: "bg-green-500" },
  skip: { borderClass: "border-yellow-500", fillClass: "bg-yellow-500" },
  error: { borderClass: "border-red-500", fillClass: "bg-red-500" },
} as const

export const AISegmentImageViewer = ({ data }: AISegmentImageViewerProps) => {
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex w-full items-center justify-center gap-2 text-center font-bold">
        <AIIcon
          label={t("fields.flows.aiSegmentImage", {
            aiName: t(getAiProviderLabelKey("muse")),
          })}
          provider="muse"
        />
      </div>
      {data.target && (
        <div className="flex flex-col gap-1 text-muted-foreground text-xs">
          <span className="truncate">
            {t("fields.aiSegmentImage.target.label")}: {data.target}
          </span>
          <span>{t(matchSelectionLabelKeys[data.matchSelection])}</span>
        </div>
      )}
      <div className="flex flex-col items-end gap-2">
        {data.states.map((state) => (
          <StateHandle
            key={state.id}
            label={t(stateLabelKeys[state.stateType])}
            stateId={state.id}
            {...stateColors[state.stateType]}
          />
        ))}
      </div>
    </div>
  )
}
