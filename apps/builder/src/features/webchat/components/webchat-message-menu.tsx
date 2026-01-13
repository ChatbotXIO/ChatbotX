"use client"

import {
  ContentType,
  PersistentMenuType,
  SenderType,
} from "@aha.chat/database/types"
import { MessageType } from "@aha.chat/sdk"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { createId } from "@paralleldrive/cuid2"
import { MenuIcon } from "lucide-react"
import Link from "next/link"
import { useAction } from "next-safe-action/hooks"
import { Fragment, useEffect, useState } from "react"
import { createWebchatMessageAction } from "@/features/messages/actions/create-webchat-message.action"
import { useGuestSessionStore } from "../providers/store/guest-session-provider"
import type { PersistentMenuSchema } from "../schemas/webchat.schema"

type WebchatMessageMenuProps = {
  chatbotId: string
  webchatId: string
}

export default function WebchatMessageMenu({
  chatbotId,
  webchatId,
}: WebchatMessageMenuProps) {
  const { getMenus } = useGuestSessionStore((state) => state)
  const [menus, setMenus] = useState<PersistentMenuSchema[]>([])

  useEffect(() => {
    setMenus(getMenus())
  }, [getMenus])

  const { appendMessage, guestConversationId } = useGuestSessionStore(
    (state) => state,
  )

  const { execute } = useAction(createWebchatMessageAction, {
    onExecute: ({ input }) => {
      // try to push raw message to store
      if ("content" in input && input.content) {
        appendMessage({
          content: input.content as string,
          id: createId(),
          createdAt: new Date(),
          updatedAt: new Date(),
          chatbotId: "",
          inboxId: "",
          sourceId: null,
          conversationId: "",
          contentAttributes: null,
          messageType: MessageType.incoming,
          contentType: ContentType.text,
          senderType: SenderType.contact,
          senderId: "",
          clientId: input.clientId,
        })
      }
    },
  })

  return menus.length > 0 ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="size-5" size="icon" variant="ghost">
          <MenuIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        {menus.map((menu, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: wip
          <Fragment key={index}>
            {menu.type === PersistentMenuType.flow && (
              <DropdownMenuItem
                onClick={() =>
                  execute({
                    content: menu.label,
                    flowId: menu.flowId,
                    clientId: createId(),
                    chatbotId,
                    webchatId,
                    guestConversationId: guestConversationId ?? "",
                  })
                }
              >
                {menu.label}
              </DropdownMenuItem>
            )}
            {menu.type === PersistentMenuType.website && (
              <DropdownMenuItem asChild>
                <Link href={menu.url} rel="noopener noreferrer" target="_blank">
                  {menu.label}
                </Link>
              </DropdownMenuItem>
            )}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null
}
