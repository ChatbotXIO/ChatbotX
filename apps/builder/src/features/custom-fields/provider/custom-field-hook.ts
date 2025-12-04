import {
  CustomFieldType,
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
  [CustomFieldType.shortText]: TextIcon,
  [CustomFieldType.longText]: TextIcon,
  [CustomFieldType.number]: HashIcon,
  [CustomFieldType.date]: CalendarDaysIcon,
  [CustomFieldType.datetime]: CalendarClockIcon,
  [CustomFieldType.boolean]: CheckIcon,
}

export const reservedCustomFieldOptions: {
  name: string
  customFieldType: CustomFieldType
  id: ReservedCustomFieldNames
}[] = [
  {
    name: "First Name",
    id: reservedCustomFieldNames.first_name,
    customFieldType: CustomFieldType.shortText,
  },
  {
    name: "Last Name",
    id: reservedCustomFieldNames.last_name,
    customFieldType: CustomFieldType.shortText,
  },
  {
    name: "Full Name",
    id: reservedCustomFieldNames.full_name,
    customFieldType: CustomFieldType.shortText,
  },
  {
    name: "Email",
    id: reservedCustomFieldNames.email,
    customFieldType: CustomFieldType.shortText,
  },
  {
    name: "Phone Number",
    id: reservedCustomFieldNames.phone_number,
    customFieldType: CustomFieldType.shortText,
  },
  {
    name: "Avatar",
    id: reservedCustomFieldNames.avatar,
    customFieldType: CustomFieldType.shortText,
  },
  {
    name: "Locale",
    id: reservedCustomFieldNames.locale,
    customFieldType: CustomFieldType.shortText,
  },
  {
    name: "Gender",
    id: reservedCustomFieldNames.gender,
    customFieldType: CustomFieldType.shortText,
  },
  {
    name: "Timezone",
    id: reservedCustomFieldNames.timezone,
    customFieldType: CustomFieldType.shortText,
  },
  {
    name: "User ID",
    id: reservedCustomFieldNames.user_id,
    customFieldType: CustomFieldType.shortText,
  },
  {
    name: "User Tags",
    id: reservedCustomFieldNames.user_tags,
    customFieldType: CustomFieldType.shortText,
  },
  {
    name: "Account Name",
    id: reservedCustomFieldNames.account_name,
    customFieldType: CustomFieldType.shortText,
  },
  {
    name: "Account ID",
    id: reservedCustomFieldNames.account_id,
    customFieldType: CustomFieldType.shortText,
  },
  {
    name: "Page User Name",
    id: reservedCustomFieldNames.page_user_name,
    customFieldType: CustomFieldType.shortText,
  },
  {
    name: "Last Input",
    id: reservedCustomFieldNames.last_input,
    customFieldType: CustomFieldType.shortText,
  },
  {
    name: "Current Time",
    id: reservedCustomFieldNames.current_time,
    customFieldType: CustomFieldType.shortText,
  },
]

export const useCustomFieldSelectOptions = (props: {
  customFieldTypes?: CustomFieldType[]
  includeReserved?: boolean
}): SelectOption[] => {
  const { customFieldTypes, includeReserved = true } = props

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
