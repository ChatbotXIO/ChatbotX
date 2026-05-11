"use client"

import type { CustomFieldType } from "@chatbotx.io/database/partials"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { AtSignIcon, PhoneIcon, TextIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { useChatStore } from "../chat/store/chat-store-provider"
import { ContactCustomFieldManage } from "../custom-fields/contact-custom-field-manage"
import { customFieldIconsMap } from "../custom-fields/provider/custom-field-hook"
import { useCustomFieldStore } from "../custom-fields/provider/custom-field-store-context"
import { EditContactField } from "./edit-contact-field"
import type { GetContactResponse } from "./schemas/query"
import type { ContactEditableField } from "./schemas/resource"
import { useAvatarUrl } from "./utils"

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

  const [selectedField, setSelectedField] =
    useState<ContactEditableField | null>(null)

  const { customFields, initialized: initializedCustomFields } =
    useCustomFieldStore((state) => state)

  const [contactFields, setContactFields] = useState<ContactEditableField[]>([])

  const handleCustomFieldDeleted = (customFieldId: string) => {
    setContactFields((previous) =>
      previous.filter((field) => field.key !== customFieldId),
    )
  }

  const handleCustomFieldUpdated = (customFieldId: string, value: string) => {
    setContactFields((previous) =>
      previous.map((field) =>
        field.key === customFieldId ? { ...field, value } : field,
      ),
    )
  }

  const handleChooseCustomField = (customFieldId: string) => {
    const targetCustomField = customFields.find(
      (field) => field.id.toString() === customFieldId,
    )
    if (!targetCustomField) {
      return
    }
    setContactFields([
      ...contactFields,
      {
        key: customFieldId,
        icon: customFieldIconsMap[targetCustomField.type as CustomFieldType],
        label: targetCustomField.name,
        value: "",
        type: targetCustomField.type as CustomFieldType,
      },
    ])
  }

  const customFieldMap = useMemo(() => {
    const map = new Map()
    for (const field of customFields) {
      map.set(field.id, field)
    }
    return map
  }, [customFields])

  useEffect(() => {
    if (activeConversationId && initializedCustomFields) {
      const conversation = conversations.find(
        (item) => item.id === activeConversationId,
      )

      if (conversation?.contact) {
        const tmpContactFields: ContactEditableField[] = [
          {
            key: "email",
            icon: AtSignIcon,
            label: "Email",
            value: conversation.contact.email,
            type: "shortText",
          },
          {
            key: "firstName",
            icon: TextIcon,
            label: "First Name",
            value: conversation.contact.firstName,
            type: "shortText",
          },
          {
            key: "lastName",
            icon: TextIcon,
            label: "Last Name",
            value: conversation.contact.lastName,
            type: "shortText",
          },
          {
            key: "phoneNumber",
            icon: PhoneIcon,
            label: "Phone Number",
            value: conversation.contact.phoneNumber,
            type: "shortText",
          },
        ]

        for (const contactCustomField of contact?.customFields ?? []) {
          const targetCustomField = customFieldMap.get(contactCustomField.id)
          if (targetCustomField) {
            tmpContactFields.push({
              key: contactCustomField.id,
              icon: customFieldIconsMap[
                targetCustomField.type as CustomFieldType
              ],
              label: targetCustomField.name,
              value: contactCustomField.value,
              type: targetCustomField.type as CustomFieldType,
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
        {contactFields.map((editable) => (
          <div className="flex w-full items-center gap-1" key={editable.key}>
            <div className="flex basis-1/3 flex-wrap items-center gap-1 truncate">
              <editable.icon className="size-4" />
              <div className="flex-1 truncate dark:text-gray-400">
                {editable.label}
              </div>
            </div>

            <Button
              className="flex-1 justify-start truncate text-[12px]"
              onClick={() => setSelectedField(editable)}
              size="sm"
              variant="ghost"
            >
              {editable.value && editable.value.length > 0 ? (
                <span className="truncate dark:text-white">
                  {editable.value}
                </span>
              ) : (
                <span className="italic">-- {t("actions.clickToEdit")} --</span>
              )}
            </Button>
          </div>
        ))}
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
