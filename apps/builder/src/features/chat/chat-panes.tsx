"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  BotIcon,
  Loader2Icon,
  MessagesSquareIcon,
  UserRoundIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import type { ReactNode } from "react"
import { toast } from "sonner"
import { ContactInboxPanel } from "../contacts/contact-inbox-panel"
import { disableBotAction } from "../conversations/actions/disable-bot.action"
import ConversationList from "../conversations/conversation-list"
import type { ConversationResource } from "../conversations/schema/resource"
import {
  BOT_DISABLE_DURATION_MS,
  isConversationActive,
} from "../conversations/utils/bot-state"
import { MessageInput } from "../messages/components/message-input"
import MessageHead from "../messages/message-head"
import { MessageList } from "../messages/message-list"
import { useChatStore } from "./store/chat-store-provider"

/**
 * The inbox's three panes, split out of `chat-layout` so the layout file only
 * decides *where* they go. `chat-layout` renders one pane at a time below the
 * mobile breakpoint and all three side by side above it; the panes themselves
 * know nothing about which arrangement they are in.
 */

export type PaneState = {
  activeConversation: ConversationResource | null
  isResolvingConversation: boolean
  shouldShowEmptyState: boolean
}

function PaneEmptyState({
  description,
  icon,
  title,
}: {
  description: string
  icon: ReactNode
  title: string
}) {
  return (
    <div
      aria-live="polite"
      className="flex h-full w-full flex-col items-center justify-center px-6 text-center"
    >
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted">
        {icon}
      </div>
      <h3 className="font-semibold text-base">{title}</h3>
      <p className="mt-1 max-w-sm text-muted-foreground text-sm">
        {description}
      </p>
    </div>
  )
}

export function ConversationListPane({
  canViewEmailAndPhone,
  workspaceId,
  autoSelectFirstConversation,
}: {
  canViewEmailAndPhone: boolean
  workspaceId: string
  autoSelectFirstConversation?: boolean
}) {
  return (
    <ConversationList
      autoSelectFirstConversation={autoSelectFirstConversation}
      canViewEmailAndPhone={canViewEmailAndPhone}
      workspaceId={workspaceId}
    />
  )
}

export function MessageThreadPane({
  activeConversation,
  isResolvingConversation,
  onBack,
  onOpenContact,
  shouldShowEmptyState,
  workspaceId,
}: PaneState & {
  onBack?: () => void
  onOpenContact?: () => void
  workspaceId: string
}) {
  const t = useTranslations()
  const updateConversation = useChatStore((state) => state.updateConversation)

  const { execute: disableBot, isExecuting: isDisablingBot } = useAction(
    disableBotAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        if (activeConversation) {
          updateConversation(activeConversation.id, {
            botEnabled: false,
            botResumeAt: new Date(Date.now() + BOT_DISABLE_DURATION_MS),
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
    <>
      {isResolvingConversation && (
        <Loader2Icon className="mx-auto my-4 animate-spin" />
      )}
      {activeConversation && (
        <div className="flex h-full min-h-0 w-full flex-col">
          <MessageHead onBack={onBack} onOpenContact={onOpenContact} />
          {isConversationActive(activeConversation) && (
            <Button
              className="shrink-0 rounded-none"
              disabled={isDisablingBot}
              onClick={() => {
                disableBot({ ids: [activeConversation.id] })
              }}
              variant="secondary"
            >
              <BotIcon />
              {t("messages.botIsActive")}
            </Button>
          )}
          <MessageList />
          <MessageInput />
        </div>
      )}
      {shouldShowEmptyState && (
        <PaneEmptyState
          description={t("messages.selectConversationDescription")}
          icon={
            <MessagesSquareIcon
              aria-hidden="true"
              className="size-7 text-muted-foreground"
            />
          }
          title={t("messages.selectConversationTitle")}
        />
      )}
    </>
  )
}

export function ContactDetailPane({
  activeConversation,
  isResolvingConversation,
  shouldShowEmptyState,
  workspaceId,
}: PaneState & { workspaceId: string }) {
  const t = useTranslations()

  return (
    <>
      {isResolvingConversation && (
        <Loader2Icon className="mx-auto my-4 animate-spin" />
      )}
      {activeConversation && (
        <ContactInboxPanel
          activeConversationId={activeConversation.id}
          workspaceId={workspaceId}
        />
      )}
      {shouldShowEmptyState && (
        <PaneEmptyState
          description={t("messages.selectConversationContactDescription")}
          icon={
            <UserRoundIcon
              aria-hidden="true"
              className="size-7 text-muted-foreground"
            />
          }
          title={t("messages.selectConversationContactTitle")}
        />
      )}
    </>
  )
}
