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
  customFieldType: CustomFieldType
  id: ReservedCustomFieldNames
}[] = [
  {
    name: "First Name",
    id: reservedCustomFieldNames.first_name,
    customFieldType: "shortText",
  },
  {
    name: "Last Name",
    id: reservedCustomFieldNames.last_name,
    customFieldType: "shortText",
  },
  {
    name: "Full Name",
    id: reservedCustomFieldNames.full_name,
    customFieldType: "shortText",
  },
  {
    name: "Email",
    id: reservedCustomFieldNames.email,
    customFieldType: "shortText",
  },
  {
    name: "Phone Number",
    id: reservedCustomFieldNames.phone_number,
    customFieldType: "shortText",
  },
  {
    name: "Avatar",
    id: reservedCustomFieldNames.avatar,
    customFieldType: "shortText",
  },
  {
    name: "Locale",
    id: reservedCustomFieldNames.locale,
    customFieldType: "shortText",
  },
  {
    name: "Gender",
    id: reservedCustomFieldNames.gender,
    customFieldType: "shortText",
  },
  {
    name: "Timezone",
    id: reservedCustomFieldNames.timezone,
    customFieldType: "shortText",
  },
  {
    name: "User ID",
    id: reservedCustomFieldNames.user_id,
    customFieldType: "shortText",
  },
  {
    name: "User Tags",
    id: reservedCustomFieldNames.user_tags,
    customFieldType: "shortText",
  },
  {
    name: "Account Name",
    id: reservedCustomFieldNames.account_name,
    customFieldType: "shortText",
  },
  {
    name: "Account ID",
    id: reservedCustomFieldNames.account_id,
    customFieldType: "shortText",
  },
  {
    name: "Page User Name",
    id: reservedCustomFieldNames.page_user_name,
    customFieldType: "shortText",
  },
  {
    name: "Last Input",
    id: reservedCustomFieldNames.last_input,
    customFieldType: "shortText",
  },
  {
    name: "Current Time",
    id: reservedCustomFieldNames.current_time,
    customFieldType: "shortText",
  },
]

export const useCustomFieldSelectOptions = (props: {
  customFieldTypes?: CustomFieldType[]
  includeReserved?: boolean
}): SelectOption[] => {
  const { customFieldTypes, includeReserved } = props

  const { customFields } = useCustomFieldStore((state) => state)

  return useMemo(() => {
    const allFields = includeReserved
      ? [...reservedCustomFieldOptions, ...customFields]
      : customFields

    if (customFieldTypes) {
      return allFields
        .filter((customField) =>
          customFieldTypes.includes(customField.customFieldType),
        )
        .map((customField) => ({
          label: customField.name,
          value: customField.id,
          Icon: customFieldIconsMap[customField.customFieldType],
        }))
    }

    return allFields.map((customField) => ({
      label: customField.name,
      value: customField.id,
      Icon: customFieldIconsMap[customField.customFieldType],
    }))
  }, [customFieldTypes, includeReserved, customFields])
}
