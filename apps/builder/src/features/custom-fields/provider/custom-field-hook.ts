import {
  type CustomFieldType,
  type ReservedCustomFieldName,
  reservedCustomFieldNames,
} from "@chatbotx.io/database/partials"
import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import {
  CalendarClockIcon,
  CalendarDaysIcon,
  CheckIcon,
  HashIcon,
  type LucideIcon,
  TextIcon,
} from "lucide-react"
import { useMemo } from "react"
import { useCustomFieldStore } from "./custom-field-store-context"

export const customFieldIconsMap: Record<CustomFieldType, LucideIcon> = {
  shortText: TextIcon,
  longText: TextIcon,
  number: HashIcon,
  date: CalendarDaysIcon,
  datetime: CalendarClockIcon,
  boolean: CheckIcon,
}

export const reservedCustomFieldOptions: {
  name: string
  type: CustomFieldType
  id: ReservedCustomFieldName
}[] = [
  {
    name: "First Name",
    id: reservedCustomFieldNames.enum.first_name,
    type: "shortText",
  },
  {
    name: "Last Name",
    id: reservedCustomFieldNames.enum.last_name,
    type: "shortText",
  },
  {
    name: "Full Name",
    id: reservedCustomFieldNames.enum.full_name,
    type: "shortText",
  },
  {
    name: "Email",
    id: reservedCustomFieldNames.enum.email,
    type: "shortText",
  },
  {
    name: "Phone Number",
    id: reservedCustomFieldNames.enum.phone_number,
    type: "shortText",
  },
  {
    name: "Avatar",
    id: reservedCustomFieldNames.enum.avatar,
    type: "shortText",
  },
  {
    name: "Locale",
    id: reservedCustomFieldNames.enum.locale,
    type: "shortText",
  },
  {
    name: "Gender",
    id: reservedCustomFieldNames.enum.gender,
    type: "shortText",
  },
  {
    name: "Timezone",
    id: reservedCustomFieldNames.enum.timezone,
    type: "shortText",
  },
  {
    name: "User ID",
    id: reservedCustomFieldNames.enum.user_id,
    type: "shortText",
  },
  {
    name: "User Tags",
    id: reservedCustomFieldNames.enum.user_tags,
    type: "shortText",
  },
  {
    name: "Account Name",
    id: reservedCustomFieldNames.enum.account_name,
    type: "shortText",
  },
  {
    name: "Account ID",
    id: reservedCustomFieldNames.enum.account_id,
    type: "shortText",
  },
  {
    name: "Page User Name",
    id: reservedCustomFieldNames.enum.page_user_name,
    type: "shortText",
  },
  {
    name: "Last Input",
    id: reservedCustomFieldNames.enum.last_input,
    type: "shortText",
  },
  {
    name: "Current Time",
    id: reservedCustomFieldNames.enum.current_time,
    type: "shortText",
  },
]

export const useCustomFieldSelectOptions = (
  props: {
    customFieldTypes?: CustomFieldType[]
    includeReserved?: boolean
    prefix?: string
  } = {},
): SelectOption[] => {
  const { customFieldTypes, includeReserved, prefix } = props

  const { customFields } = useCustomFieldStore((state) => state)

  return useMemo(() => {
    const allFields = includeReserved
      ? [...reservedCustomFieldOptions, ...customFields]
      : customFields

    if (customFieldTypes) {
      return allFields
        .filter((customField) =>
          customFieldTypes.includes(customField.type as CustomFieldType),
        )
        .map((customField) => ({
          label: customField.name,
          value: prefix
            ? `${prefix}:${customField.id}`
            : customField.id.toString(),
          Icon: customFieldIconsMap[customField.type as CustomFieldType],
        }))
    }

    return allFields.map((customField) => ({
      label: customField.name,
      value: prefix ? `${prefix}:${customField.id}` : customField.id.toString(),
      Icon: customFieldIconsMap[customField.type as CustomFieldType],
    }))
  }, [customFieldTypes, includeReserved, customFields, prefix])
}
