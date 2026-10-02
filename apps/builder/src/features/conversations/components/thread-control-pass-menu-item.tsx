"use client"

import { DropdownMenuItem } from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { ArrowRightLeftIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { THREAD_CONTROL_CHANNEL_UI } from "@/features/messages/lib/thread-control-channel-ui"
import { useThreadControl } from "../hooks/use-thread-control"
import type { ListConversationItemResource } from "../schema/resource"
import { ThreadControlPassDialog } from "./thread-control-pass-dialog"

/**
 * "Pass to escalation" in the conversation's action menu, behind a
 * confirmation because it hands the thread away. Rendered only while this app
 * owns the thread and is not itself the escalation partner (Meta forbids an
 * escalation owner from passing to escalation). Channels that pass to the AI
 * agent (`passTarget: "aiAgent"`) use the header button instead.
 */
export function ThreadControlPassMenuItem({
  conversation,
}: {
  conversation: ListConversationItemResource
}) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const threadControl = useThreadControl(conversation)
  if (
    !threadControl?.canPass ||
    THREAD_CONTROL_CHANNEL_UI[threadControl.channel].passTarget !== "escalation"
  ) {
    return null
  }
  return (
    <>
      <DropdownMenuItem
        closeOnClick={false}
        onClick={(event) => {
          event.preventDefault()
          setOpen(true)
        }}
      >
        <ArrowRightLeftIcon />
        {t("conversationRouting.pass.menuItem")}
      </DropdownMenuItem>
      <ThreadControlPassDialog
        contactInboxId={threadControl.contactInboxId}
        conversation={conversation}
        onOpenChange={setOpen}
        open={open}
        passTarget="escalation"
      />
    </>
  )
}
