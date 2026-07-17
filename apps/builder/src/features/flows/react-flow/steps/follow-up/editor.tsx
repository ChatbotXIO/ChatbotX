"use client"

import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { useTranslations } from "next-intl"
import DelayUnitSelect from "../wait/components/delay-unit-select"

type FollowUpStepEditorProps = {
  parentName: string
}

const FollowUpStepEditor = ({ parentName }: FollowUpStepEditorProps) => {
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <Label className="text-muted-foreground text-xs">
          {t("flows.followUp.durationLabel")}
        </Label>
        <div className="flex gap-2">
          <InputNumberField
            className="min-w-[80px] flex-1"
            name={`${parentName}.duration`}
          />
          <DelayUnitSelect name={`${parentName}.unit`} />
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        {t("flows.followUp.cancelOnReplyHint")}
      </p>
    </div>
  )
}

export default FollowUpStepEditor
