"use client"

import {
  type WebchatPersistentMenu,
  webchatPersistentMenuType,
} from "@aha.chat/database/schema"
import { MessageType } from "@aha.chat/sdk"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { createId } from "@chatbotx.io/utils"
import { MenuIcon } from "lucide-react"
import Link from "next/link"
import { useAction } from "next-safe-action/hooks"
import { Fragment, useEffect, useState } from "react"
import { createWebchatMessageAction } from "@/features/messages/actions/create-webchat-message.action"
import { useGuestSessionStore } from "../providers/store/guest-session-provider"

type WebchatMessageMenuProps = {
  chatbotId: bigint
  webchatId: bigint
}

export default function WebchatMessageMenu({
  chatbotId,
  webchatId,
}: WebchatMessageMenuProps) {
  const { getMenus } = useGuestSessionStore((state) => state)
  const [menus, setMenus] = useState<WebchatPersistentMenu[]>([])

  useEffect(() => {
    setMenus(getMenus())
  }, [getMenus])

  const { appendMessage, guestConversationId } = useGuestSessionStore(
    (state) => state,
  )

  const { execute } = useAction(createWebchatMessageAction, {
    onExecute: ({ input }) => {
      // try to push raw message to store
      if ("text" in input && input.text) {
        appendMessage({
          text: input.text as string,
          id: createId(),
          createdAt: new Date(),
          updatedAt: new Date(),
          chatbotId: BigInt(0),
          inboxId: BigInt(0),
          sourceId: null,
          conversationId: BigInt(0),
          contentAttributes: null,
          messageType: MessageType.incoming,
          contentType: "text",
          senderType: "contact",
          senderId: BigInt(0),
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
            {menu.type === webchatPersistentMenuType.enum.flow && (
              <DropdownMenuItem
                onClick={() =>
                  execute({
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
            {menu.type === webchatPersistentMenuType.enum.url && (
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
