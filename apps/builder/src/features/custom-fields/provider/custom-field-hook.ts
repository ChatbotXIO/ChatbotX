import {
  type ChannelType,
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

export const reservedCustomFieldIds: {
  type: CustomFieldType
  id: SystemFieldType
  labelKey: string
  channels?: ChannelType[]
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
    // Dedicated key: `fields.phoneNumber` is the form-field label ("Phone
    // number") reused across contact forms and template dialogs.
    labelKey: "fields.phone.label",
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
    id: systemFieldTypes.enum["ai.queued.messages"],
    type: "shortText",
    labelKey: "fields.aiQueuedMessages.label",
  },
  {
    id: systemFieldTypes.enum.current_time,
    type: "shortText",
    labelKey: "fields.currentTime.label",
  },
  {
    id: systemFieldTypes.enum.booking_calendar,
    type: "shortText",
    labelKey: "fields.bookingCalendar.label",
  },
  {
    id: systemFieldTypes.enum.booking_date,
    type: "datetime",
    labelKey: "fields.bookingDate.label",
  },
  {
    id: systemFieldTypes.enum.last_seen,
    type: "datetime",
    labelKey: "fields.lastSeen.label",
  },
  {
    id: systemFieldTypes.enum.last_interaction,
    type: "datetime",
    labelKey: "fields.lastInteraction.label",
  },
  {
    id: systemFieldTypes.enum.inbox_link,
    type: "shortText",
    labelKey: "fields.inboxLink.label",
  },
  {
    id: systemFieldTypes.enum.last_btn_title,
    type: "shortText",
    labelKey: "fields.lastButtonTitle.label",
  },
  {
    id: systemFieldTypes.enum.fb_chat_link,
    type: "shortText",
    labelKey: "fields.fbChatLink.label",
    channels: ["messenger"],
  },
  {
    id: systemFieldTypes.enum.last_fb_comment,
    type: "shortText",
    labelKey: "fields.lastFbComment.label",
    channels: ["messenger", "instagram"],
  },
]

export const useCustomFieldSelectOptions = (
  props: {
    customFieldTypes?: CustomFieldType[]
    includeReserved?: boolean
    prefix?: string
    customFieldValueKey?: "name"
    channels?: ChannelType[]
    reservedFieldIds?: SystemFieldType[]
  } = {},
): SelectOption[] => {
  const {
    customFieldTypes,
    includeReserved,
    prefix,
    customFieldValueKey,
    channels,
    reservedFieldIds,
  } = props
  const t = useTranslations()

  const { customFields: rawCustomFields } = useCustomFieldStore(
    (state) => state,
  )

  // `channels` still drives the filter below; it no longer prefixes the label.
  const reservedCustomFieldOptions = useMemo(
    () =>
      reservedCustomFieldIds.map((field) => ({
        ...field,
        name: t(field.labelKey),
      })),
    [t],
  )

  return useMemo(() => {
    const matchesType = (type: string) =>
      !customFieldTypes || customFieldTypes.includes(type as CustomFieldType)

    const toOption = (
      field: { id: string | number; name: string; type: string },
      value: string,
    ): SelectOption => ({
      label: field.name,
      value: prefix ? `${prefix}:${value}` : value,
      icon: customFieldIconsMap[field.type as CustomFieldType],
    })

    const reservedOptions = includeReserved
      ? reservedCustomFieldOptions
          .filter(
            (field) =>
              (reservedFieldIds
                ? reservedFieldIds.includes(field.id)
                : matchesType(field.type)) &&
              (!(field.channels && channels) ||
                field.channels.some((channel) => channels.includes(channel))),
          )
          .map((field) => toOption(field, field.id.toString()))
      : []

    const customOptions = rawCustomFields
      .filter((field) => matchesType(field.type))
      .map((field) =>
        toOption(
          field,
          customFieldValueKey === "name" ? field.name : field.id.toString(),
        ),
      )

    return [...reservedOptions, ...customOptions]
  }, [
    customFieldTypes,
    customFieldValueKey,
    channels,
    reservedFieldIds,
    includeReserved,
    rawCustomFields,
    prefix,
    reservedCustomFieldOptions,
  ])
}
