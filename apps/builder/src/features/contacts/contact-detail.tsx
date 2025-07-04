"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { callAPI } from "@/lib/swr"
import { AtSignIcon, PhoneIcon, TextIcon } from "lucide-react"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    if (activeConversationId) {
      const conversation = conversations.find(
        (conversation) => conversation.id === activeConversationId,
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
      <div className="flex justify-center my-5">
        <Avatar className="size-24">
          <AvatarImage
            src={contact.avatar ?? ""}
            alt={contact.firstName ?? ""}
          />
          <AvatarFallback>NA</AvatarFallback>
        </Avatar>
      </div>
      <div className="flex flex-col gap-1 text-gray-600 text-[12px] font-medium">
        {editableData.map((editable) => {
          return (
            <div className="flex w-full items-center gap-1" key={editable.key}>
              <div className="flex flex-wrap items-center basis-1/3 truncate gap-1">
                <editable.icon className="size-4" />
                <div className="flex-1 truncate">{editable.label}</div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="flex-1 truncate text-[12px] justify-start"
                onClick={() => setSelectedField(editable.key)}
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
        id={contact.id}
        open={!!selectedField}
        onOpenChange={() => setSelectedField(null)}
        contact={contact}
        selectedField={selectedField}
      />
    </div>
  ) : null
}
