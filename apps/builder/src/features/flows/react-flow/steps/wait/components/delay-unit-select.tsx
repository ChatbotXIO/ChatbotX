import { waitStepDelayUnits } from "@chatbotx.io/flow-config"
import {
  SelectField,
  type SelectFieldProps,
} from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import type { FieldValues } from "react-hook-form"

type DelayUnitSelectProps = SelectFieldProps<FieldValues>

const DelayUnitSelect = (props: DelayUnitSelectProps) => {
  const t = useTranslations()

  const delayUnits = [
    {
      value: waitStepDelayUnits.enum.seconds,
      label: t("fields.delayUnit.seconds"),
    },
    {
      value: waitStepDelayUnits.enum.minutes,
      label: t("fields.delayUnit.minutes"),
    },
    {
      value: waitStepDelayUnits.enum.hours,
      label: t("fields.delayUnit.hours"),
    },
    { value: waitStepDelayUnits.enum.days, label: t("fields.delayUnit.days") },
  ]

  return <SelectField {...props} options={delayUnits} />
}

export default DelayUnitSelect
