"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@aha.chat/ui/components/ui/avatar"
import { Button } from "@aha.chat/ui/components/ui/button"
import { AtSignIcon, PhoneIcon, TextIcon } from "lucide-react"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { callAPI } from "@/lib/swr"
import { useChatStore } from "../chat/store/chat-store-provider"
import { ContactCustomFieldManage } from "../custom-fields/contact-custom-field-manage"
import type { CustomFieldCollection } from "../custom-fields/schemas"
import { EditContactField } from "./edit-contact-field"
import type { ContactResource } from "./schemas"

export const ContactDetail = () => {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const { activeConversationId, conversations } = useChatStore((state) => state)

  const [contact, setContact] = useState<ContactResource | null>(null)
  const [selectedField, setSelectedField] = useState<string | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: wip
  useEffect(() => {
    if (activeConversationId) {
      const conversation = conversations.find(
        (item) => item.id === activeConversationId,
      )
      setContact(conversation?.contact ?? null)
    } else {
      setContact(null)
    }
  }, [activeConversationId])

  // Get all custom fields
  const customFieldsUrl = `/api/chatbots/${chatbotId}/custom-fields?perPage=9999`
  const { data } = callAPI<CustomFieldCollection>(customFieldsUrl)
  const allCustomFields = data?.data || []

  const editableData = [
    {
      key: "email",
      icon: AtSignIcon,
      label: "Email",
      value: contact?.email,
    },
    {
      key: "firstName",
      icon: TextIcon,
      label: "First Name",
      value: contact?.firstName,
    },
    {
      key: "lastName",
      icon: TextIcon,
      label: "Last Name",
      value: contact?.lastName,
    },
    {
      key: "phoneNumber",
      icon: PhoneIcon,
      label: "Phone Number",
      value: contact?.phoneNumber,
    },
  ]

  for (const cc of contact?.contactCustomFields || []) {
    const targetCustomField = allCustomFields.find(
      (c) => c.id === cc.customFieldId,
    )
    if (targetCustomField) {
      editableData.push({
        key: cc.customFieldId,
        icon: TextIcon,
        label: targetCustomField.name,
        value: cc.value,
      })
    }
  }

  return contact ? (
    <div className="flex flex-col">
      <div className="my-5 flex justify-center">
        <Avatar className="size-24">
          <AvatarImage
            alt={contact.firstName ?? ""}
            src={contact.avatar ?? ""}
          />
          <AvatarFallback>NA</AvatarFallback>
        </Avatar>
      </div>
      <div className="flex flex-col gap-1 font-medium text-[12px] text-gray-600">
        {editableData.map((editable) => {
          return (
            <div className="flex w-full items-center gap-1" key={editable.key}>
              <div className="flex basis-1/3 flex-wrap items-center gap-1 truncate">
                <editable.icon className="size-4" />
                <div className="flex-1 truncate">{editable.label}</div>
              </div>

              <Button
                className="flex-1 justify-start truncate text-[12px]"
                onClick={() => setSelectedField(editable.key)}
                size="sm"
                variant="ghost"
              >
                {editable.value ?? "-- Click to edit --"}
              </Button>
            </div>
          )
        })}

        <ContactCustomFieldManage chatbotId={chatbotId} />
      </div>

      <EditContactField
        chatbotId={chatbotId}
        contact={contact}
        id={contact.id}
        onOpenChange={() => setSelectedField(null)}
        open={Boolean(selectedField)}
        selectedField={selectedField}
      />
    </div>
  ) : null
}
