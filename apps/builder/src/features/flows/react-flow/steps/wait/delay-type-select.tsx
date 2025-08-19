import { DelayType } from "@aha.chat/flow-config"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useTranslate } from "@tolgee/react"

type DelayTypeSelectProps = {
  name: string
}

export const DelayTypeSelect = (props: DelayTypeSelectProps) => {
  const { t } = useTranslate()

  const delayTypes = [
    {
      value: DelayType.Duration,
      label: t("flows.DelayType.Duration"),
    },
    {
      value: DelayType.SpecificDate,
      label: t("flows.DelayType.SpecificDate"),
    },
    {
      value: DelayType.DatetimeCustomField,
      label: t("flows.DelayType.DatetimeCustomField"),
    },
  ]

  return (
    <SelectField
      label={t("flows.Wait.DelayType")}
      name={props.name}
      options={delayTypes}
      placeholder="Select a type"
    />
  )
}
