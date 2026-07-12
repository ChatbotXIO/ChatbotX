import type { ChannelType } from "@chatbotx.io/database/partials"
import {
  ComboboxField,
  type ComboboxFieldProps,
} from "@chatbotx.io/ui/components/form/combobox-field"
import type { FieldValues } from "react-hook-form"
import { useCustomFieldSelectOptions } from "../provider/custom-field-hook"

type CustomFieldFieldProps = Omit<
  ComboboxFieldProps<FieldValues>,
  "options"
> & {
  includeReserved?: boolean
  channels?: ChannelType[]
}

export default function CustomFieldField(props: CustomFieldFieldProps) {
  const { includeReserved, channels, ...rest } = props

  const customFieldOptions = useCustomFieldSelectOptions({
    includeReserved,
    channels,
  })

  return <ComboboxField {...rest} options={customFieldOptions} />
}
