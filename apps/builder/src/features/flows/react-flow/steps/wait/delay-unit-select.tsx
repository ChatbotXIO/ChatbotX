import { SelectField } from "@/components/form/select-field"
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
    <SelectField name={name} placeholder="Select a unit" options={delayUnits} />
  )
}
