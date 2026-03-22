import {
  type CustomFieldType,
  type ReservedCustomFieldNames,
  reservedCustomFieldNames,
} from "@aha.chat/database/types"
import type { SelectOption } from "@aha.chat/ui/components/form/select-field"
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
  id: ReservedCustomFieldNames
}[] = [
  {
    name: "First Name",
    id: reservedCustomFieldNames.first_name,
    type: "shortText",
  },
  {
    name: "Last Name",
    id: reservedCustomFieldNames.last_name,
    type: "shortText",
  },
  {
    name: "Full Name",
    id: reservedCustomFieldNames.full_name,
    type: "shortText",
  },
  {
    name: "Email",
    id: reservedCustomFieldNames.email,
    type: "shortText",
  },
  {
    name: "Phone Number",
    id: reservedCustomFieldNames.phone_number,
    type: "shortText",
  },
  {
    name: "Avatar",
    id: reservedCustomFieldNames.avatar,
    type: "shortText",
  },
  {
    name: "Locale",
    id: reservedCustomFieldNames.locale,
    type: "shortText",
  },
  {
    name: "Gender",
    id: reservedCustomFieldNames.gender,
    type: "shortText",
  },
  {
    name: "Timezone",
    id: reservedCustomFieldNames.timezone,
    type: "shortText",
  },
  {
    name: "User ID",
    id: reservedCustomFieldNames.user_id,
    type: "shortText",
  },
  {
    name: "User Tags",
    id: reservedCustomFieldNames.user_tags,
    type: "shortText",
  },
  {
    name: "Account Name",
    id: reservedCustomFieldNames.account_name,
    type: "shortText",
  },
  {
    name: "Account ID",
    id: reservedCustomFieldNames.account_id,
    type: "shortText",
  },
  {
    name: "Page User Name",
    id: reservedCustomFieldNames.page_user_name,
    type: "shortText",
  },
  {
    name: "Last Input",
    id: reservedCustomFieldNames.last_input,
    type: "shortText",
  },
  {
    name: "Current Time",
    id: reservedCustomFieldNames.current_time,
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
        .filter((customField) => customFieldTypes.includes(customField.type))
        .map((customField) => ({
          label: customField.name,
          value: prefix ? `${prefix}:${customField.id}` : customField.id,
          Icon: customFieldIconsMap[customField.type],
        }))
    }

    return allFields.map((customField) => ({
      label: customField.name,
      value: prefix ? `${prefix}:${customField.id}` : customField.id,
      Icon: customFieldIconsMap[customField.type],
    }))
  }, [customFieldTypes, includeReserved, customFields, prefix])
}
