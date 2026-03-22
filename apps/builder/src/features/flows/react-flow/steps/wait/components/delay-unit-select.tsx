import { DelayUnit } from "@aha.chat/flow-config"
import {
  SelectField,
  type SelectFieldProps,
} from "@aha.chat/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import type { FieldValues } from "react-hook-form"

type DelayUnitSelectProps = SelectFieldProps<FieldValues>

const DelayUnitSelect = (props: DelayUnitSelectProps) => {
  const t = useTranslations()

  const delayUnits = [
    { value: DelayUnit.seconds, label: t("fields.delayUnit.seconds") },
    { value: DelayUnit.minutes, label: t("fields.delayUnit.minutes") },
    { value: DelayUnit.hours, label: t("fields.delayUnit.hours") },
    { value: DelayUnit.days, label: t("fields.delayUnit.days") },
  ]

  return <SelectField {...props} options={delayUnits} />
}

export default DelayUnitSelect
