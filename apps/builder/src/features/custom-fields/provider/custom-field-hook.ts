import {
  type CustomFieldType,
  type SystemFieldType,
  systemFieldTypes,
} from "@chatbotx.io/database/partials"
import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import {
  CalendarClockIcon,
  CalendarDaysIcon,
  CheckIcon,
  HashIcon,
  type LucideIcon,
  MailIcon,
  PhoneIcon,
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
  email: MailIcon,
  phoneNumber: PhoneIcon,
}

export const reservedCustomFieldOptions: {
  name: string
  type: CustomFieldType
  id: SystemFieldType
}[] = [
  {
    name: "First Name",
    id: systemFieldTypes.enum.firstName,
    type: "shortText",
  },
  {
    name: "Last Name",
    id: systemFieldTypes.enum.lastName,
    type: "shortText",
  },
  {
    name: "Full Name",
    id: systemFieldTypes.enum.fullName,
    type: "shortText",
  },
  {
    name: "Email",
    id: systemFieldTypes.enum.email,
    type: "shortText",
  },
  {
    name: "Phone Number",
    id: systemFieldTypes.enum.phoneNumber,
    type: "shortText",
  },
  {
    name: "Avatar",
    id: systemFieldTypes.enum.avatar,
    type: "shortText",
  },
  {
    name: "Locale",
    id: systemFieldTypes.enum.locale,
    type: "shortText",
  },
  {
    name: "Gender",
    id: systemFieldTypes.enum.gender,
    type: "shortText",
  },
  {
    name: "Timezone",
    id: systemFieldTypes.enum.timezone,
    type: "shortText",
  },
  {
    name: "User ID",
    id: systemFieldTypes.enum.userId,
    type: "shortText",
  },
  {
    name: "User Tags",
    id: systemFieldTypes.enum.userTags,
    type: "shortText",
  },
  {
    name: "Account Name",
    id: systemFieldTypes.enum.accountName,
    type: "shortText",
  },
  {
    name: "Account ID",
    id: systemFieldTypes.enum.accountId,
    type: "shortText",
  },
  {
    name: "Page User Name",
    id: systemFieldTypes.enum.pageUserName,
    type: "shortText",
  },
  {
    name: "Last Input",
    id: systemFieldTypes.enum.lastInput,
    type: "shortText",
  },
  {
    name: "Current Time",
    id: systemFieldTypes.enum.currentTime,
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
      value: customField.id,
      Icon: customFieldIconsMap[customField.type as CustomFieldType],
    }))
  }, [customFieldTypes, includeReserved, customFields, prefix])
}
