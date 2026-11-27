"use client"

import { channelTypes } from "@chatbotx.io/database/partials"
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
import { contactDisplayName } from "@/features/contacts/lib/contact-display-name"
import { withoutTranslationTurnedOn } from "@/features/translation/lib/conversation-translation"
import { useWorkspaceId } from "@/hooks/routing"
import { useChatStore } from "../chat/store/chat-store-provider"
import { enableBotAction } from "../conversations/actions/enable-bot.action"
import { ConversationPageStrip } from "../conversations/components/conversation-page-strip"
import { ConversationParticipants } from "../conversations/components/conversation-participants"
import { ThreadControlPassButton } from "../conversations/components/thread-control-pass-button"
import { ThreadControlReleaseButton } from "../conversations/components/thread-control-release-button"
import { UpdateConversationAssignee } from "../conversations/components/update-conversation-assignee"
import { ConversationAction } from "../conversations/conversation-action"
import { isConversationActive } from "../conversations/utils/bot-state"
import { findContactInboxByChannel } from "../conversations/utils/contact-inbox"
import { useOutboundCallMode } from "../integration-whatsapp/calling/voip/use-outbound-call-mode"
import { WhatsappVoipCallButton } from "../integration-whatsapp/calling/voip/whatsapp-voip-call-button"
import { useOptionalWhatsappVoipCallContext } from "../integration-whatsapp/calling/voip/whatsapp-voip-call-context"

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

  const voipCallContext = useOptionalWhatsappVoipCallContext()

  // Resolves in the background — never blocks this header's own render (the
  // VoIP call button below renders synchronously from data already in
  // scope). The query only decides what a CLICK on the VoIP button does — if
  // it is still pending when clicked, the `preparing` phase absorbs the wait.
  const outboundCallMode = useOutboundCallMode(
    workspaceId,
    activeConversation?.id,
    undefined,
    { enabled: Boolean(voipCallContext) },
  )

  // Whether this conversation has a WhatsApp contact inbox at all — the
  // VoIP call button renders for every WhatsApp conversation regardless of
  // whether `outboundCallMode` has resolved yet.
  const whatsappContactInbox = findContactInboxByChannel(
    activeConversation,
    channelTypes.enum.whatsapp,
  )

  const { execute: enableBot, isExecuting: isEnablingBot } = useAction(
    enableBotAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        if (activeConversation) {
          updateConversation(activeConversation.id, {
            botEnabled: true,
            botResumeAt: null,
            additionalAttributes: withoutTranslationTurnedOn(
              activeConversation.additionalAttributes,
            ),
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
      <div className="shrink-0 border-b">
        <div className="flex items-center gap-2 px-3 pb-2">
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
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 flex-1 truncate font-semibold text-[0.9375rem] leading-5">
                {contactDisplayName(activeConversation?.contact)}
              </div>
              {/* The actions share the name's row, so they take a compact
                height here: the header's density belongs to this layout, not
                to each button component. */}
              <div className="flex shrink-0 items-center gap-1 [&_button]:h-7 [&_button]:text-xs">
                {whatsappContactInbox && (
                  <WhatsappVoipCallButton
                    contactInboxId={whatsappContactInbox.id}
                    contactName={contactDisplayName(
                      activeConversation?.contact,
                    )}
                    conversationId={activeConversation.id}
                    outboundCallMode={outboundCallMode.data}
                  />
                )}
                <ThreadControlReleaseButton conversation={activeConversation} />
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
                <ThreadControlPassButton conversation={activeConversation} />
                <ConversationAction conversation={activeConversation} />
              </div>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="shrink-0">
                <UpdateConversationAssignee
                  conversation={activeConversation}
                  onChange={setAssignee}
                />
              </div>
              <div className="flex min-w-0 justify-end text-end">
                <ConversationParticipants conversation={activeConversation} />
              </div>
            </div>
          </div>
        </div>
        <ConversationPageStrip conversation={activeConversation} />
      </div>
    )
  )
}
