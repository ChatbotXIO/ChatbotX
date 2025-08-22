import { DelayType } from "@aha.chat/flow-config"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useTranslations } from "next-intl"

type DelayTypeSelectProps = {
  name: string
}

export const DelayTypeSelect = (props: DelayTypeSelectProps) => {
  const t = useTranslations()

  const delayTypes = [
    {
      value: DelayType.Duration,
      label: t("flows.delayType.duration"),
    },
    {
      value: DelayType.SpecificDate,
      label: t("flows.delayType.specificDate"),
    },
    {
      value: DelayType.DatetimeCustomField,
      label: t("flows.delayType.datetimeCustomField"),
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
