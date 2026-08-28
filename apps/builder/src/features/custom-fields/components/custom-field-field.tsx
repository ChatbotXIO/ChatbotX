import type {
  ChannelType,
  CustomFieldType,
} from "@chatbotx.io/database/partials"
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
  channels?: ChannelType[]
  customFieldTypes?: CustomFieldType[]
  includeReserved?: boolean
  /**
   * Also offers Account Fields (bot fields) in a separate group. Allowlisted
   * v1 surfaces only — see `useCustomFieldSelectOptions`.
   */
  includeBotFields?: boolean
}

export default function CustomFieldField(props: CustomFieldFieldProps) {
  const {
    channels,
    customFieldTypes,
    includeReserved,
    includeBotFields,
    ...rest
  } = props

  const customFieldOptions = useCustomFieldSelectOptions({
    channels,
    customFieldTypes,
    includeReserved,
    includeBotFields,
  })

  return <ComboboxField {...rest} options={customFieldOptions} />
}
