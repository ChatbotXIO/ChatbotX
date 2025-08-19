import { DelayUnit } from "@aha.chat/flow-config"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useTranslate } from "@tolgee/react"

type DelayUnitSelectProps = {
  name: string
}

export const DelayUnitSelect = (props: DelayUnitSelectProps) => {
  const { t } = useTranslate()

  const delayUnits = [
    { value: DelayUnit.Seconds, label: t("flows.DelayUnit.Seconds") },
    { value: DelayUnit.Minutes, label: t("flows.DelayUnit.Minutes") },
    { value: DelayUnit.Hours, label: t("flows.DelayUnit.Hours") },
    { value: DelayUnit.Days, label: t("flows.DelayUnit.Days") },
  ]

  return (
    <SelectField
      name={props.name}
      options={delayUnits}
      placeholder="Select a unit"
    />
  )
}
