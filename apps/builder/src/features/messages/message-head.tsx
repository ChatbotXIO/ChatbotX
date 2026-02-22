"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@aha.chat/ui/components/ui/tooltip"
import { BotIcon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { useChatStore } from "../chat/store/chat-store-provider"
import { getFullName } from "../contacts/utils"
import { enableBotAction } from "../conversations/actions/enable-bot.action"
import { UpdateConversationAssignee } from "../conversations/components/update-conversation-assignee"
import { ConversationAction } from "../conversations/conversation-action"

export default function MessageHead() {
  const t = useTranslations()
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const {
    conversations,
    activeConversationId,
    setAssignee,
    updateConversation,
  } = useChatStore((state) => state)

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId,
  )

  const { execute: enableBot, isExecuting: isEnablingBot } = useAction(
    enableBotAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        if (activeConversation) {
          updateConversation(activeConversation.id, {
            liveChatEnabled: false,
          })
        }
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    activeConversation && (
      <div className="flex items-center gap-2 border-b px-3 pb-3">
        <div className="flex flex-1 flex-col">
          <div className="truncate font-medium text-semibold">
            {getFullName(activeConversation?.contact)}
          </div>
          <UpdateConversationAssignee
            conversation={activeConversation}
            onChange={setAssignee}
          />
        </div>
        {activeConversation.liveChatEnabled && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                disabled={isEnablingBot}
                onClick={() => {
                  enableBot({ ids: [activeConversation.id] })
                }}
                variant="ghost"
              >
                <BotIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("actions.transferConversationToBot")}</p>
            </TooltipContent>
          </Tooltip>
        )}
        <ConversationAction conversation={activeConversation} />
      </div>
    )
  )
}
