import { FormInput } from "@/components/form-input"
import { SingleSelect } from "@/components/single-select"
import { DelayUnit } from "@/features/flows/react-flow/steps/wait/schema"
import { useTranslate } from "@tolgee/react"

export const DelayUnitSelect = ({ name }: { name: string }) => {
  const { t } = useTranslate()

  const delayUnits = [
    { value: DelayUnit.Seconds, label: t("flows.DelayUnit.Seconds") },
    { value: DelayUnit.Minutes, label: t("flows.DelayUnit.Minutes") },
    { value: DelayUnit.Hours, label: t("flows.DelayUnit.Hours") },
    { value: DelayUnit.Days, label: t("flows.DelayUnit.Days") },
  ]

  return (
    <FormInput name={name} label="">
      <SingleSelect
        name={name}
        placeholder="Select a unit"
        options={delayUnits}
      />
    </FormInput>
  )
}
