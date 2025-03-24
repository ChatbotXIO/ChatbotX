import { FormInput } from "@/components/form-input"
import { SingleSelect } from "@/components/single-select"
import { DelayType } from "@/features/flows/react-flow/steps/wait/schema"
import { T, useTranslate } from "@tolgee/react"

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
    <FormInput name={name} label={<T keyName="flows.Wait.DelayType" />}>
      <SingleSelect
        name={name}
        placeholder="Select a type"
        options={delayTypes}
      />
    </FormInput>
  )
}
