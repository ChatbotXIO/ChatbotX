"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useEffect, useState } from "react"
import { useChatStore } from "../chat/store/chat-store-provider"
import type { ContactResource } from "./schemas/get-contacts-schema"
import { AtSignIcon, PhoneIcon, TextIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EditContactField } from "./edit-contact-field"

export const ContactDetail = () => {
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
      </div>

      <EditContactField
        open={!!selectedField}
        onOpenChange={() => setSelectedField(null)}
        contact={contact}
        selectedField={selectedField}
      />
    </div>
  ) : null
}
