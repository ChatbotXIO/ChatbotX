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
import { useTranslations } from "next-intl"
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

const reservedCustomFieldIds: {
  type: CustomFieldType
  id: SystemFieldType
  labelKey: string
}[] = [
  {
    id: systemFieldTypes.enum.first_name,
    type: "shortText",
    labelKey: "fields.firstName.label",
  },
  {
    id: systemFieldTypes.enum.last_name,
    type: "shortText",
    labelKey: "fields.lastName.label",
  },
  {
    id: systemFieldTypes.enum.full_name,
    type: "shortText",
    labelKey: "fields.fullName.label",
  },
  {
    id: systemFieldTypes.enum.email,
    type: "shortText",
    labelKey: "fields.email.label",
  },
  {
    id: systemFieldTypes.enum.phone,
    type: "shortText",
    labelKey: "fields.phoneNumber.label",
  },
  {
    id: systemFieldTypes.enum.avatar,
    type: "shortText",
    labelKey: "fields.avatar.label",
  },
  {
    id: systemFieldTypes.enum.locale,
    type: "shortText",
    labelKey: "fields.locale.label",
  },
  {
    id: systemFieldTypes.enum.gender,
    type: "shortText",
    labelKey: "fields.gender.label",
  },
  {
    id: systemFieldTypes.enum.timezone,
    type: "shortText",
    labelKey: "fields.timezone.label",
  },
  {
    id: systemFieldTypes.enum.user_id,
    type: "shortText",
    labelKey: "fields.userId.label",
  },
  {
    id: systemFieldTypes.enum.user_tags,
    type: "shortText",
    labelKey: "fields.userTags.label",
  },
  {
    id: systemFieldTypes.enum.workspace_name,
    type: "shortText",
    labelKey: "fields.workspaceName.label",
  },
  {
    id: systemFieldTypes.enum.workspace_id,
    type: "shortText",
    labelKey: "fields.workspaceId.label",
  },
  {
    id: systemFieldTypes.enum.page_user_name,
    type: "shortText",
    labelKey: "fields.pageUserName.label",
  },
  {
    id: systemFieldTypes.enum.last_input,
    type: "shortText",
    labelKey: "fields.lastInput.label",
  },
  {
    id: systemFieldTypes.enum.current_time,
    type: "shortText",
    labelKey: "fields.currentTime.label",
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
  const t = useTranslations()

  const { customFields } = useCustomFieldStore((state) => state)

  const reservedCustomFieldOptions = useMemo(
    () =>
      reservedCustomFieldIds.map((field) => ({
        ...field,
        name: t(field.labelKey),
      })),
    [t],
  )

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
  }, [
    customFieldTypes,
    includeReserved,
    customFields,
    prefix,
    reservedCustomFieldOptions,
  ])
}
