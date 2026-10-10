"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useMemo } from "react"
import { toast } from "sonner"
import { useAvatarUrl } from "@/features/contacts/utils"
import { findSubmissionConversationAction } from "../actions/find-submission-conversation.action"

/** Contact name that opens the contact's conversation in a new tab, like the minigame history. */
export function SubmissionContactCell({
  workspaceId,
  contact,
}: {
  workspaceId: string
  contact: { id: string; fullName: string | null; avatar: string | null }
}) {
  const t = useTranslations("miniApps.submissions")
  const avatarUrl = useAvatarUrl(contact)
  const name = contact.fullName || t("unknownContact")
  // A per-contact window name: reopening it navigates the same tab.
  const tabName = `mini-app-conversation-${contact.id}`
  const boundAction = useMemo(
    () => findSubmissionConversationAction.bind(null, workspaceId),
    [workspaceId],
  )
  const { execute, isExecuting } = useAction(boundAction, {
    onSuccess: ({ data }) => {
      if (data?.conversationId) {
        window.open(
          `/space/${workspaceId}/inbox?conversationId=${data.conversationId}`,
          tabName,
        )
      } else {
        toast.info(t("conversationNotFound"))
      }
    },
    onError: () => toast.error(t("openConversationFailed")),
  })

  return (
    <Button
      className="h-auto justify-start gap-2 px-2 py-1"
      disabled={isExecuting}
      onClick={() => execute({ contactId: contact.id })}
      variant="ghost"
    >
      <Avatar className="size-8">
        <AvatarImage alt={name} className="object-cover" src={avatarUrl} />
        <AvatarFallback>{name.slice(0, 2)}</AvatarFallback>
      </Avatar>
      <span className="font-medium">{name}</span>
      {isExecuting ? (
        <Loader aria-hidden="true" className="size-4 animate-spin" />
      ) : null}
    </Button>
  )
}
