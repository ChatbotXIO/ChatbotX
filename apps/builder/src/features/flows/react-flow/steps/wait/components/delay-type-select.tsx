import { DelayType } from "@chatbotx.io/flow-config"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"

type DelayTypeSelectProps = {
  name: string
}

const DelayTypeSelect = (props: DelayTypeSelectProps) => {
  const t = useTranslations()

  const delayTypes = [
    {
      value: DelayType.duration,
      label: t("flows.delayType.duration"),
    },
    {
      value: DelayType.date,
      label: t("flows.delayType.date"),
    },
    {
      value: DelayType.random,
      label: t("flows.delayType.random"),
    },
  ]

  return (
    <SelectField
      label={t("fields.delayType.label")}
      name={props.name}
      options={delayTypes}
      placeholder={t("fields.delayType.placeholder")}
    />
  )
}

export default DelayTypeSelect
