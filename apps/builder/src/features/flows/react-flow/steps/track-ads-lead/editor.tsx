"use client"

import { TrendingUpIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

// No config beyond the discriminant: attribution/dedup/channel are all
// resolved server-side by `adsConversionService.recordFlowStepConversion`
// (see `packages/flow-config/src/steps/track-ads-lead.ts` and the worker
// step handler). Mirrors the Trigger action's `trackAdsLead` shape.
export const TrackAdsLeadEditor = () => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={TrendingUpIcon}
      title={t("flows.actions.trackAdsLead")}
    >
      <p className="text-muted-foreground text-xs">
        {t("metaConversions.trackAdsFlowStep.helpNote")}
      </p>
    </BaseStepEditor>
  )
}
