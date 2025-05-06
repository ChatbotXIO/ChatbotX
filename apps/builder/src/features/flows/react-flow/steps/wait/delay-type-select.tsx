import { SelectField } from "@/components/form/select-field"
import { DelayType } from "@/features/flows/react-flow/steps/wait/schema"
import { useTranslate } from "@tolgee/react"

export const DelayTypeSelect = ({ name }: { name: string }) => {
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
      name={name}
      label={t("flows.Wait.DelayType")}
      placeholder="Select a type"
      options={delayTypes}
    />
  )
}
