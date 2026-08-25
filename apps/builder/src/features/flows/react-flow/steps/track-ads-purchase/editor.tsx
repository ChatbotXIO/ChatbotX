"use client"

import { TrendingUpIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { CapiValueCurrencyFields } from "@/features/meta-conversions/components/capi-value-currency-fields"
import { BaseStepEditor } from "../base/editor"

type TrackAdsPurchaseEditorProps = {
  parentName: string
}

// STATIC value/currency only, reusing the same shared field pair as
// `sendMetaCapiEvent` (CapiEventFields) and the Trigger action's
// `TrackAdsPurchaseFields` — not duplicated here.
export const TrackAdsPurchaseEditor = ({
  parentName,
}: TrackAdsPurchaseEditorProps) => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={TrendingUpIcon}
      title={t("flows.actions.trackAdsPurchase")}
    >
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs">
          {t("metaConversions.trackAdsFlowStep.helpNote")}
        </p>
        <div className="mt-2 flex flex-col gap-4">
          <CapiValueCurrencyFields parentName={parentName} />
        </div>
      </div>
    </BaseStepEditor>
  )
}
