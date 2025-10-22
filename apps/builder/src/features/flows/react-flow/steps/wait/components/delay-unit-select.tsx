import { DelayUnit } from "@aha.chat/flow-config"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useTranslations } from "next-intl"

type DelayUnitSelectProps = {
  name: string
}

const DelayUnitSelect = (props: DelayUnitSelectProps) => {
  const t = useTranslations()

  const delayUnits = [
    { value: DelayUnit.second, label: t("flows.delayUnit.seconds") },
    { value: DelayUnit.minute, label: t("flows.delayUnit.minutes") },
    { value: DelayUnit.hour, label: t("flows.delayUnit.hours") },
    { value: DelayUnit.day, label: t("flows.delayUnit.days") },
  ]

  return (
    <SelectField
      name={props.name}
      options={delayUnits}
      placeholder={t("flows.delayUnit.placeholder")}
    />
  )
}

export default DelayUnitSelect
