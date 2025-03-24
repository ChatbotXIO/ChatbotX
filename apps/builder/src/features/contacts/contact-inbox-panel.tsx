import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useEffect, useState } from "react"
import { useChatStore } from "../chat/store/chat-store-provider"
import type { ContactResource } from "./schemas/get-contacts-schema"
import { AtSignIcon, Edit2Icon, PhoneIcon } from "lucide-react"

export const ContactInboxPanel = () => {
  const { activeConversationId, conversations } = useChatStore((state) => state)

  const [contact, setContact] = useState<ContactResource | null>(null)
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
      <div className="grid grid-cols-3 gap-x-2 gap-y-3 text-gray-600 text-sm">
        <div className="flex gap-1 items-center font-medium">
          <AtSignIcon className="size-4" />
          <span>Email</span>
        </div>
        <div className="col-span-2 flex items-center gap-2">
          <span className="truncate">{contact.email ?? "---"}</span>
          <Edit2Icon className="size-4" />
        </div>

        <div className="flex gap-1 items-center font-medium">
          <PhoneIcon className="size-4" />
          <span>Phone</span>
        </div>
        <div className="col-span-2 flex items-center gap-2">
          <span className="truncate">{contact.phoneNumber ?? "---"}</span>
          <Edit2Icon className="size-4" />
        </div>
      </div>
    </div>
  ) : null
}
