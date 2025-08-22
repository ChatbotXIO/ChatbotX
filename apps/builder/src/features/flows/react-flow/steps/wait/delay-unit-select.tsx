import { DelayUnit } from "@aha.chat/flow-config"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useTranslations } from "next-intl"

type DelayUnitSelectProps = {
  name: string
}

export const DelayUnitSelect = (props: DelayUnitSelectProps) => {
  const t = useTranslations()

  const delayUnits = [
    { value: DelayUnit.Seconds, label: t("flows.delayUnit.seconds") },
    { value: DelayUnit.Minutes, label: t("flows.delayUnit.minutes") },
    { value: DelayUnit.Hours, label: t("flows.delayUnit.hours") },
    { value: DelayUnit.Days, label: t("flows.delayUnit.days") },
  ]

  return (
    <SelectField
      name={props.name}
      options={delayUnits}
      placeholder={t("flows.delayUnit.placeholder")}
    />
  )
}
