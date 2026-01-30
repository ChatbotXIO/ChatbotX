import {
  ComboboxField,
  type ComboboxFieldProps,
} from "@aha.chat/ui/components/form/combobox-field"
import type { FieldValues } from "react-hook-form"
import { useCustomFieldSelectOptions } from "../provider/custom-field-hook"

type CustomFieldFieldProps = Omit<
  ComboboxFieldProps<FieldValues>,
  "options"
> & {
  includeReserved?: boolean
}

export default function CustomFieldField(props: CustomFieldFieldProps) {
  const { includeReserved, ...rest } = props

  const customFieldOptions = useCustomFieldSelectOptions({ includeReserved })

  return <ComboboxField {...rest} options={customFieldOptions} />
}
