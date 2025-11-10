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
    { value: DelayUnit.second, label: t("fields.delayUnit.seconds") },
    { value: DelayUnit.minute, label: t("fields.delayUnit.minutes") },
    { value: DelayUnit.hour, label: t("fields.delayUnit.hours") },
    { value: DelayUnit.day, label: t("fields.delayUnit.days") },
  ]

  return <SelectField {...props} options={delayUnits} />
}

export default DelayUnitSelect
