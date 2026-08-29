"use client"

import {
  contactLanguageOptions,
  contactTimezoneOptions,
  normalizeStoredTimezone,
  offsetFromStoredTimezone,
} from "@chatbotx.io/business/contact-locale"
import type {
  ChannelType,
  CustomFieldType,
} from "@chatbotx.io/database/partials"
import { channelTypes, customFieldTypes } from "@chatbotx.io/database/partials"
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
  FingerprintIcon,
  IdCardIcon,
  LanguagesIcon,
  type LucideIcon,
  MegaphoneIcon,
  PhoneIcon,
  TextIcon,
  UserRoundIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { useChatStore } from "../chat/store/chat-store-provider"
import { getBrowserTimezone } from "../contact-filter/lib/timezone"
import type { ContactInboxResource } from "../contact-inboxes/schema/resource"
import { ContactCustomFieldManage } from "../custom-fields/contact-custom-field-manage"
import { formatCustomFieldDisplayValue } from "../custom-fields/lib/format-custom-field-display-value"
import { customFieldIconsMap } from "../custom-fields/provider/custom-field-hook"
import { useCustomFieldStore } from "../custom-fields/provider/custom-field-store-context"
import { EditContactField } from "./edit-contact-field"
import type { GetContactResponse } from "./schemas/query"
import type { ContactEditableField } from "./schemas/resource"
import { useAvatarUrl } from "./utils"

// Guards the ad source URL to navigable http(s) so a non-URL / `javascript:`
// referral value never becomes an anchor href.
const HTTP_URL_RE = /^https?:\/\//

const READ_ONLY_VALUE_CLASS =
  "inline-flex h-8 flex-1 items-center justify-start truncate rounded-md px-3 text-[12px]"

// Read-only field value: an external link when the field carries an `href`
// (e.g. the ad source URL), otherwise plain muted text.
function ReadOnlyFieldValue({
  href,
  children,
}: {
  href?: string | null
  children: React.ReactNode
}) {
  if (href) {
    return (
      <a
        className={`${READ_ONLY_VALUE_CLASS} text-primary underline hover:text-primary/80`}
        href={href}
        rel="noopener noreferrer"
        target="_blank"
      >
        {children}
      </a>
    )
  }
  return (
    <div className={`${READ_ONLY_VALUE_CLASS} text-muted-foreground`}>
      {children}
    </div>
  )
}

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

type ScopedIdentityRowConfig = {
  key: "sourceUserId" | "sourceUsername"
  icon: LucideIcon
  labelKey: string
}

/**
 * Per-channel display config for the channel-scoped identity columns on
 * ContactInbox (`sourceUserId`/`sourceUsername`). Labels are channel-branded,
 * so each channel that populates these columns declares its own rows here —
 * adding a channel is one config entry, no branching.
 */
const scopedIdentityRowsByChannel: Partial<
  Record<ChannelType, readonly ScopedIdentityRowConfig[]>
> = {
  [channelTypes.enum.whatsapp]: [
    {
      key: "sourceUserId",
      icon: FingerprintIcon,
      labelKey: "fields.waUserId.label",
    },
    {
      key: "sourceUsername",
      icon: AtSignIcon,
      labelKey: "fields.waUserName.label",
    },
  ],
}

const buildScopedIdentityFields = (
  contactInbox: ContactInboxResource | undefined,
  t: (key: string) => string,
): ContactEditableField[] => {
  const parsedChannel = channelTypes.safeParse(contactInbox?.channel)
  if (!(contactInbox && parsedChannel.success)) {
    return []
  }
  const rows = scopedIdentityRowsByChannel[parsedChannel.data] ?? []
  return rows.flatMap((row): ContactEditableField[] => {
    const value = contactInbox[row.key]
    // Skip absent values, and a value that IS the Contact ID shown above
    // (a scoped-id-keyed contact) — no duplicate row.
    if (!value || value === contactInbox.sourceId) {
      return []
    }
    return [
      {
        key: row.key,
        icon: row.icon,
        label: t(row.labelKey),
        value,
        type: "shortText",
        readOnly: true,
      },
    ]
  })
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

  const getContactFieldDisplayValue = (
    key: string,
    value: string,
    type: CustomFieldType,
  ) => {
    switch (key) {
      case "language":
        return getLanguageLabel(value, t)
      case "gender":
        return formatGender(value, t)
      case "timezone":
        return formatTimezoneLabel(value)
      default:
        return formatCustomFieldDisplayValue(type, value, timezone, {
          false: t("fields.boolean.false"),
          true: t("fields.boolean.true"),
        })
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
                : getContactFieldDisplayValue(fieldKey, value, field.type),
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
        // The ad the contact clicked from (any ad-attributed inbox), shown as
        // a link right under Contact ID. Guarded to http(s) so a non-navigable
        // / `javascript:` referral value never becomes an anchor href.
        const rawAdSourceUrl = conversation.contactInboxes.find(
          (contactInbox) => contactInbox.adReferral?.sourceUrl,
        )?.adReferral?.sourceUrl
        const adSourceUrl =
          rawAdSourceUrl && HTTP_URL_RE.test(rawAdSourceUrl)
            ? rawAdSourceUrl
            : null
        const tmpContactFields: ContactEditableField[] = [
          {
            key: "channelContactId",
            icon: IdCardIcon,
            label: t("fields.contactId.label"),
            value: channelContactId,
            type: "shortText",
            readOnly: true,
          },
          ...(adSourceUrl
            ? [
                {
                  key: "adSource",
                  icon: MegaphoneIcon,
                  label: t("fields.adSource.label"),
                  value: adSourceUrl,
                  href: adSourceUrl,
                  type: "shortText" as const,
                  readOnly: true,
                },
              ]
            : []),
          ...buildScopedIdentityFields(activeContactInbox, t),
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
              value: formatCustomFieldDisplayValue(
                targetCustomField.type,
                contactCustomField.value,
                timezone,
                {
                  false: t("fields.boolean.false"),
                  true: t("fields.boolean.true"),
                },
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
                <ReadOnlyFieldValue href={editable.href}>
                  {fieldValue}
                </ReadOnlyFieldValue>
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
