"use client"

import {
  contactLanguageOptions,
  contactTimezoneOptions,
  normalizeStoredTimezone,
  offsetFromStoredTimezone,
} from "@chatbotx.io/business/contact-locale"
import type { CustomFieldType } from "@chatbotx.io/database/partials"
import { customFieldTypes } from "@chatbotx.io/database/partials"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  formatCustomFieldValueInTimeZone,
  isTemporalCustomFieldType,
  resolveTemporalCustomFieldFormValue,
} from "@chatbotx.io/utils/datetime"
import {
  AtSignIcon,
  ClockIcon,
  IdCardIcon,
  LanguagesIcon,
  PhoneIcon,
  TextIcon,
  UserRoundIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { useChatStore } from "../chat/store/chat-store-provider"
import { getBrowserTimezone } from "../contact-filter/lib/timezone"
import { ContactCustomFieldManage } from "../custom-fields/contact-custom-field-manage"
import { customFieldIconsMap } from "../custom-fields/provider/custom-field-hook"
import { useCustomFieldStore } from "../custom-fields/provider/custom-field-store-context"
import { EditContactField } from "./edit-contact-field"
import type { GetContactResponse } from "./schemas/query"
import type { ContactEditableField } from "./schemas/resource"
import { useAvatarUrl } from "./utils"

const formatGender = (
  gender: string | null | undefined,
  t: (key: string) => string,
) => {
  switch (gender) {
    case "male":
    case "female":
    case "unknown":
      return t(`fields.gender.${gender}`)
    default:
      return gender
  }
}

const formatTimezoneOffset = (timezone: string | null | undefined) => {
  const offset = offsetFromStoredTimezone(timezone)
  if (!offset) {
    return null
  }

  return offset.startsWith("-") || offset.startsWith("+")
    ? `UTC${offset}`
    : `UTC+${offset}`
}

const formatTimezoneLabel = (timezone: string | null | undefined) => {
  const normalizedTimezone = normalizeStoredTimezone(timezone)
  if (!normalizedTimezone) {
    return normalizedTimezone
  }

  const offsetLabel = formatTimezoneOffset(normalizedTimezone)
  return offsetLabel
    ? `${normalizedTimezone} (${offsetLabel})`
    : normalizedTimezone
}

const timezoneOptions = contactTimezoneOptions.map((option) => ({
  label: formatTimezoneLabel(option.value) ?? option.label,
  value: option.value,
}))

const getLanguageLabel = (
  language: string | null | undefined,
  t: (key: string) => string,
) => {
  const option = contactLanguageOptions.find((item) => item.value === language)
  return option ? t(option.labelKey) : language
}

export const ContactDetail = ({
  activeConversationId,
  contact,
}: {
  activeConversationId: string | null
  contact: GetContactResponse | null
}) => {
  const t = useTranslations()

  const workspaceId = useWorkspaceId()
  const { conversations } = useChatStore((state) => state)
  const avatarUrl = useAvatarUrl(contact)
  const [timezone, setTimezone] = useState("UTC")

  const [selectedField, setSelectedField] =
    useState<ContactEditableField | null>(null)

  const { customFields, initialized: initializedCustomFields } =
    useCustomFieldStore((state) => state)

  const [contactFields, setContactFields] = useState<ContactEditableField[]>([])

  useEffect(() => {
    setTimezone(getBrowserTimezone())
  }, [])

  const genderOptions = useMemo(
    () => [
      { label: t("fields.gender.male"), value: "male" },
      { label: t("fields.gender.female"), value: "female" },
      { label: t("fields.gender.unknown"), value: "unknown" },
    ],
    [t],
  )

  const languageOptions = useMemo(
    () =>
      contactLanguageOptions.map((option) => ({
        label: t(option.labelKey),
        value: option.value,
      })),
    [t],
  )

  const getContactFieldDisplayValue = (key: string, value: string) => {
    switch (key) {
      case "language":
        return getLanguageLabel(value, t)
      case "gender":
        return formatGender(value, t)
      case "timezone":
        return formatTimezoneLabel(value)
      default:
        return value
    }
  }

  const handleCustomFieldDeleted = (customFieldId: string) => {
    setContactFields((previous) =>
      previous.filter((field) => field.key !== customFieldId),
    )
  }

  const handleCustomFieldUpdated = (fieldKey: string, value: string) => {
    setContactFields((previous) =>
      previous.map((field) =>
        field.key === fieldKey
          ? {
              ...field,
              formValue: value,
              value: isTemporalCustomFieldType(field.type)
                ? formatCustomFieldValueInTimeZone(field.type, value, timezone)
                : getContactFieldDisplayValue(fieldKey, value),
            }
          : field,
      ),
    )
  }

  const handleChooseCustomField = (customFieldId: string) => {
    const targetCustomField = customFieldMap.get(customFieldId)
    if (!targetCustomField) {
      return
    }
    setContactFields((previous) => [
      ...previous,
      {
        key: customFieldId,
        icon: customFieldIconsMap[targetCustomField.type],
        label: targetCustomField.name,
        value: "",
        type: targetCustomField.type,
      },
    ])
  }

  const customFieldMap = useMemo(() => {
    const map = new Map<string, { name: string; type: CustomFieldType }>()
    for (const field of customFields) {
      const parsedType = customFieldTypes.safeParse(field.type)
      if (!parsedType.success) {
        continue
      }
      map.set(field.id.toString(), {
        name: field.name,
        type: parsedType.data,
      })
    }
    return map
  }, [customFields])

  useEffect(() => {
    if (activeConversationId && initializedCustomFields) {
      const conversation = conversations.find(
        (item) => item.id === activeConversationId,
      )

      if (conversation?.contact) {
        const activeContactInbox = conversation.contactInboxes[0]
        const channelContactId = activeContactInbox?.sourceId
        const tmpContactFields: ContactEditableField[] = [
          {
            key: "channelContactId",
            icon: IdCardIcon,
            label: t("fields.contactId.label"),
            value: channelContactId,
            type: "shortText",
            readOnly: true,
          },
          {
            key: "language",
            icon: LanguagesIcon,
            label: t("fields.language.label"),
            value: getLanguageLabel(activeContactInbox?.language, t),
            formValue: activeContactInbox?.language,
            contactInboxId: activeContactInbox?.id,
            options: languageOptions,
            type: "shortText",
          },
          {
            key: "gender",
            icon: UserRoundIcon,
            label: t("fields.gender.label"),
            value: formatGender(conversation.contact.gender, t),
            formValue: conversation.contact.gender,
            options: genderOptions,
            type: "shortText",
          },
          {
            key: "timezone",
            icon: ClockIcon,
            label: t("fields.timezone.label"),
            value: formatTimezoneLabel(conversation.contact.timezone),
            formValue:
              normalizeStoredTimezone(conversation.contact.timezone) ??
              conversation.contact.timezone,
            options: timezoneOptions,
            type: "shortText",
          },
          {
            key: "email",
            icon: AtSignIcon,
            label: t("fields.email.label"),
            value: conversation.contact.email,
            type: "shortText",
          },
          {
            key: "firstName",
            icon: TextIcon,
            label: t("fields.firstName.label"),
            value: conversation.contact.firstName,
            type: "shortText",
          },
          {
            key: "lastName",
            icon: TextIcon,
            label: t("fields.lastName.label"),
            value: conversation.contact.lastName,
            type: "shortText",
          },
          {
            key: "phoneNumber",
            icon: PhoneIcon,
            label: t("fields.phoneNumber.label"),
            value: conversation.contact.phoneNumber,
            type: "shortText",
          },
        ]

        for (const contactCustomField of contact?.customFields ?? []) {
          const targetCustomField = customFieldMap.get(contactCustomField.id)
          if (targetCustomField) {
            tmpContactFields.push({
              key: contactCustomField.id,
              icon: customFieldIconsMap[targetCustomField.type],
              label: targetCustomField.name,
              value: formatCustomFieldValueInTimeZone(
                targetCustomField.type,
                contactCustomField.value,
                timezone,
              ),
              formValue: isTemporalCustomFieldType(targetCustomField.type)
                ? resolveTemporalCustomFieldFormValue(
                    targetCustomField.type,
                    contactCustomField.value,
                  )
                : contactCustomField.value,
              type: targetCustomField.type,
            })
          }
        }

        setContactFields(tmpContactFields)
      } else {
        setContactFields([])
      }
    } else {
      setContactFields([])
    }
  }, [
    activeConversationId,
    conversations,
    initializedCustomFields,
    contact,
    customFieldMap,
    genderOptions,
    languageOptions,
    timezone,
    t,
  ])

  return contact ? (
    <div className="flex flex-col">
      <div className="my-5 flex justify-center">
        <Avatar className="size-24">
          <AvatarImage
            alt={contact.firstName ?? ""}
            className="object-cover"
            src={avatarUrl}
          />
          <AvatarFallback>NA</AvatarFallback>
        </Avatar>
      </div>
      <div className="flex flex-col gap-1 font-medium text-[12px] text-gray-600">
        {contactFields.map((editable) => {
          const fieldValue =
            editable.value && editable.value.length > 0 ? (
              <span className="truncate dark:text-white">{editable.value}</span>
            ) : (
              <span className="italic">
                {editable.readOnly ? "--" : `-- ${t("actions.clickToEdit")} --`}
              </span>
            )

          return (
            <div className="flex w-full items-center gap-1" key={editable.key}>
              <div className="flex basis-1/3 flex-wrap items-center gap-1 truncate">
                <editable.icon className="size-4" />
                <div className="flex-1 truncate dark:text-gray-400">
                  {editable.label}
                </div>
              </div>

              {editable.readOnly ? (
                <div className="inline-flex h-8 flex-1 items-center justify-start truncate rounded-md px-3 text-[12px] text-muted-foreground">
                  {fieldValue}
                </div>
              ) : (
                <Button
                  className="flex-1 justify-start truncate text-[12px]"
                  onClick={() => setSelectedField(editable)}
                  size="sm"
                  variant="ghost"
                >
                  {fieldValue}
                </Button>
              )}
            </div>
          )
        })}
        <ContactCustomFieldManage
          disabledIds={contactFields.map((field) => field.key)}
          onChooseCustomField={handleChooseCustomField}
          workspaceId={workspaceId}
        />
      </div>

      <EditContactField
        contactId={contact.id}
        onDeleted={handleCustomFieldDeleted}
        onOpenChange={() => setSelectedField(null)}
        onUpdated={handleCustomFieldUpdated}
        open={Boolean(selectedField)}
        targetField={selectedField}
        workspaceId={workspaceId}
      />
    </div>
  ) : null
}
