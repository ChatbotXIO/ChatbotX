"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { ArrowLeftIcon, BotIcon, UserRoundIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import { useChatStore } from "../chat/store/chat-store-provider"
import { enableBotAction } from "../conversations/actions/enable-bot.action"
import { UpdateConversationAssignee } from "../conversations/components/update-conversation-assignee"
import { ConversationAction } from "../conversations/conversation-action"
import { isConversationActive } from "../conversations/utils/bot-state"
import { useOutboundCallMode } from "../integration-whatsapp/calling/voip/use-outbound-call-mode"
import { WhatsappVoipCallButton } from "../integration-whatsapp/calling/voip/whatsapp-voip-call-button"

/**
 * `onBack` and `onOpenContact` are supplied only by the mobile inbox layout,
 * where the conversation list and the contact panel are separate views rather
 * than adjacent columns. On desktop both are omitted and nothing extra renders.
 */
export default function MessageHead({
  onBack,
  onOpenContact,
}: {
  onBack?: () => void
  onOpenContact?: () => void
}) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()

  const {
    conversations,
    activeConversationId,
    setAssignee,
    updateConversation,
  } = useChatStore((state) => state)

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId,
  )

  // Resolves in the background — never blocks this header's own render (the
  // VoIP call button below renders synchronously from data already in
  // scope). The query only decides what a CLICK on the VoIP button does — if
  // it is still pending when clicked, the `preparing` phase absorbs the wait.
  const outboundCallMode = useOutboundCallMode(
    workspaceId,
    activeConversation?.id,
  )

  // Whether this conversation has a WhatsApp contact inbox at all — the
  // VoIP call button renders for every WhatsApp conversation regardless of
  // whether `outboundCallMode` has resolved yet.
  const whatsappContactInbox = activeConversation?.contactInboxes.find(
    (contactInbox) => contactInbox.channel === "whatsapp",
  )

  const { execute: enableBot, isExecuting: isEnablingBot } = useAction(
    enableBotAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        if (activeConversation) {
          updateConversation(activeConversation.id, {
            botEnabled: true,
            botResumeAt: null,
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
      <div className="flex shrink-0 items-center gap-2 border-b px-3 pb-3">
        {onBack && (
          <Button
            aria-label={t("actions.back")}
            className="shrink-0"
            onClick={onBack}
            size="icon"
            variant="ghost"
          >
            <ArrowLeftIcon className="rtl:rotate-180" />
          </Button>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="truncate font-medium text-semibold">
            {activeConversation?.contact?.fullName}
          </div>
          <UpdateConversationAssignee
            conversation={activeConversation}
            onChange={setAssignee}
          />
        </div>
        {whatsappContactInbox && (
          <WhatsappVoipCallButton
            contactInboxId={whatsappContactInbox.id}
            contactName={activeConversation?.contact?.fullName}
            conversationId={activeConversation.id}
            outboundCallMode={outboundCallMode.data}
          />
        )}
        {!isConversationActive(activeConversation) && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  disabled={isEnablingBot}
                  onClick={() => {
                    enableBot({ ids: [activeConversation.id] })
                  }}
                  variant="ghost"
                >
                  <BotIcon />
                </Button>
              }
            />
            <TooltipContent>
              <p>{t("actions.transferConversationToBot")}</p>
            </TooltipContent>
          </Tooltip>
        )}
        {onOpenContact && (
          <Button
            aria-label={t("fields.contact.label")}
            className="shrink-0"
            onClick={onOpenContact}
            size="icon"
            variant="ghost"
          >
            <UserRoundIcon />
          </Button>
        )}
        <ConversationAction conversation={activeConversation} />
      </div>
    )
  )
}
