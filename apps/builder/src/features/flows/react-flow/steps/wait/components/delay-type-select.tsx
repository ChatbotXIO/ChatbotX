import { waitStepDelayTypes } from "@chatbotx.io/flow-config"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"

type DelayTypeSelectProps = {
  name: string
}

const DelayTypeSelect = (props: DelayTypeSelectProps) => {
  const t = useTranslations()

  const delayTypes = [
    {
      value: waitStepDelayTypes.enum.duration,
      label: t("flows.delayType.duration"),
    },
    {
      value: waitStepDelayTypes.enum.date,
      label: t("flows.delayType.date"),
    },
    {
      value: waitStepDelayTypes.enum.random,
      label: t("flows.delayType.random"),
    },
  ]

  return (
    <SelectField
      label={t("fields.delayType.label")}
      name={props.name}
      options={delayTypes}
    />
  )
}

export default DelayTypeSelect
