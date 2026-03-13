"use client"

import type { ContactCustomFieldModel } from "@aha.chat/database/types"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@aha.chat/ui/components/ui/avatar"
import { Button } from "@aha.chat/ui/components/ui/button"
import { AtSignIcon, PhoneIcon, TextIcon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useChatStore } from "../chat/store/chat-store-provider"
import { ContactCustomFieldManage } from "../custom-fields/contact-custom-field-manage"
import { customFieldIconsMap } from "../custom-fields/provider/custom-field-hook"
import { useCustomFieldStore } from "../custom-fields/provider/custom-field-store-context"
import { EditContactField } from "./edit-contact-field"
import type { ContactEditableField, ContactResource } from "./schemas/resource"
import { getAvatarUrl } from "./utils"

export const ContactDetail = () => {
  const t = useTranslations()

  const { chatbotId } = useParams<{ chatbotId: string }>()
  const { activeConversationId, conversations } = useChatStore((state) => state)

  const [contact, setContact] = useState<ContactResource | null>(null)
  const [selectedField, setSelectedField] =
    useState<ContactEditableField | null>(null)

  const { customFields, initialized: initializedCustomFields } =
    useCustomFieldStore((state) => state)

  const [contactFields, setContactFields] = useState<ContactEditableField[]>([])

  useEffect(() => {
    if (activeConversationId && initializedCustomFields) {
      const conversation = conversations.find(
        (item) => item.id === activeConversationId,
      )

      if (conversation?.contact) {
        setContact(conversation.contact)

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

        // TODO: get contact custom fields from conversation
        for (const cc of [] as ContactCustomFieldModel[]) {
          // for (const cc of conversation?.contact.contactCustomFields || []) {
          const targetCustomField = customFields.find(
            (c) => c.id === cc.customFieldId,
          )
          if (targetCustomField) {
            tmpContactFields.push({
              key: cc.customFieldId,
              icon: customFieldIconsMap[targetCustomField.type],
              label: targetCustomField.name,
              value: cc.value,
              type: targetCustomField.type,
            })
          }
        }

        setContactFields(tmpContactFields)
      } else {
        setContact(null)
        setContactFields([])
      }
    } else {
      setContact(null)
      setContactFields([])
    }
  }, [
    activeConversationId,
    initializedCustomFields,
    conversations,
    customFields,
  ])

  return contact ? (
    <div className="flex flex-col">
      <div className="my-5 flex justify-center">
        <Avatar className="size-24">
          <AvatarImage
            alt={contact.firstName ?? ""}
            className="object-cover"
            src={getAvatarUrl(contact)}
          />
          <AvatarFallback>NA</AvatarFallback>
        </Avatar>
      </div>
      <div className="flex flex-col gap-1 font-medium text-[12px] text-gray-600">
        {contactFields.map((editable) => (
          <div className="flex w-full items-center gap-1" key={editable.key}>
            <div className="flex basis-1/3 flex-wrap items-center gap-1 truncate">
              <editable.icon className="size-4" />
              <div className="flex-1 truncate dark:text-white">
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
          chatbotId={chatbotId}
          disabledIds={contactFields.map((c) => c.key)}
          onChooseCustomField={(customFieldId) => {
            const targetCustomField = customFields.find(
              (c) => c.id === customFieldId,
            )

            if (targetCustomField) {
              setContactFields([
                ...contactFields,
                {
                  key: customFieldId,
                  icon: customFieldIconsMap[targetCustomField.type],
                  label: targetCustomField.name,
                  value: "",
                  type: targetCustomField.type,
                },
              ])
            }
          }}
        />
      </div>

      <EditContactField
        chatbotId={chatbotId}
        contactId={contact.id}
        onDeleted={(key) => {
          const updatedContactFields = contactFields.filter(
            (field) => field.key !== key,
          )
          setContactFields(updatedContactFields)
        }}
        onOpenChange={() => setSelectedField(null)}
        onUpdated={(key, value) => {
          const updatedContactFields = contactFields.map((field) => {
            if (field.key === key) {
              return { ...field, value }
            }
            return field
          })
          setContactFields(updatedContactFields)
        }}
        open={Boolean(selectedField)}
        targetField={selectedField}
      />
    </div>
  ) : null
}
