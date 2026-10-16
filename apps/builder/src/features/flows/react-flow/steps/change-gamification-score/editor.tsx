"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { RadioGroupField } from "@chatbotx.io/ui/components/form/radio-group-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { TrophyIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useLeaderboardOptions } from "@/features/leaderboards/lib/use-leaderboard-options"
import { BaseStepEditor } from "../base/editor"

const ChangeGamificationScoreStepEditor = ({
  parentName,
}: {
  parentName: string
}) => {
  const t = useTranslations()
  const { options } = useLeaderboardOptions()

  return (
    <BaseStepEditor
      icon={TrophyIcon}
      title={t("flows.actions.changeGamificationScore")}
    >
      <div className="mt-5 flex flex-col gap-4">
        <ComboboxField
          emptyText={t("actions.noRecordFound")}
          label={t("flows.changeGamificationScore.leaderboard")}
          name={`${parentName}.leaderboardId`}
          options={options}
          placeholder={t("actions.pleaseSelect")}
          popoverClassName="w-[var(--anchor-width)]"
          searchPlaceholder={t("actions.search")}
        />
        <RadioGroupField
          label={t("flows.changeGamificationScore.operation")}
          name={`${parentName}.operation`}
          options={[
            { label: t("flows.changeGamificationScore.add"), value: "add" },
            {
              label: t("flows.changeGamificationScore.subtract"),
              value: "subtract",
            },
          ]}
        />
        <InputNumberField
          label={t("flows.changeGamificationScore.points")}
          max={1_000_000}
          min={1}
          name={`${parentName}.points`}
          required
          stepper={1}
        />
        <SwitchField
          label={t("flows.changeGamificationScore.targetUser")}
          name={`${parentName}.targetUser`}
        />
        <SwitchField
          description={t("flows.changeGamificationScore.targetReferrerHint")}
          label={t("flows.changeGamificationScore.targetReferrer")}
          name={`${parentName}.targetReferrer`}
        />
      </div>
    </BaseStepEditor>
  )
}

export default ChangeGamificationScoreStepEditor
