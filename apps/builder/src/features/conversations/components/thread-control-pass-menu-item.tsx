"use client"

import { DropdownMenuItem } from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { ArrowRightLeftIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { THREAD_CONTROL_CHANNEL_UI } from "@/features/messages/lib/thread-control-channel-ui"
import { useThreadControl } from "../hooks/use-thread-control"
import type { ListConversationItemResource } from "../schema/resource"
import { ThreadControlPassPartnerDialog } from "./thread-control-pass-partner-dialog"

/**
 * "Pass to a partner" in the conversation's action menu, behind a dialog
 * because it hands the thread away: the agent picks the receiving role and may
 * leave a note. Rendered while this app owns the thread, including as the
 * escalation partner (which may pass to any other role). Channels that pass to
 * the AI agent (`passTarget: "aiAgent"`) use the header button instead.
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
      <ThreadControlPassPartnerDialog
        channel={threadControl.channel}
        contactInboxId={threadControl.contactInboxId}
        conversation={conversation}
        inboxId={threadControl.inboxId}
        onOpenChange={setOpen}
        open={open}
        ownerRole={threadControl.ownerRole}
      />
    </>
  )
}
