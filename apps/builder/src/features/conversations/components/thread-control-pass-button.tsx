"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { SparklesIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { useThreadControl } from "../hooks/use-thread-control"
import type { ListConversationItemResource } from "../schema/resource"
import {
  canReturnToAiAgent,
  findAiHandoverContactInbox,
} from "../utils/thread-control"
import { ThreadControlPassDialog } from "./thread-control-pass-dialog"

/**
 * Header "return to the AI" for channels whose pass hands the thread to the AI
 * agent (`passTarget: "aiAgent"`, e.g. Messenger's AI hand-over). Shown while this
 * app holds the thread, including one whose routing was never observed (as in
 * v1); while the AI owns it the owner pill and locked composer already say so.
 * Icon-only below `md`, label kept in the tooltip and aria-label.
 */
export function ThreadControlPassButton({
  conversation,
}: {
  conversation: ListConversationItemResource
}) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  // Scoped to the AI-agent inbox so another channel's routing (an owned
  // WhatsApp thread) can never hide the button, and its idle clock still ticks.
  const aiInbox = findAiHandoverContactInbox(conversation)
  const aiInboxConversation = useMemo(
    () => (aiInbox ? { contactInboxes: [aiInbox] } : null),
    [aiInbox],
  )
  const view = useThreadControl(aiInboxConversation)

  if (!(aiInbox && canReturnToAiAgent(aiInbox, view))) {
    return null
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={t("conversationRouting.aiHandover.label")}
              className="shrink-0"
              onClick={() => setOpen(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <SparklesIcon aria-hidden />
              <span className="hidden md:inline">
                {t("conversationRouting.aiHandover.label")}
              </span>
            </Button>
          }
        />
        <TooltipContent>
          {t("conversationRouting.aiHandover.tooltip")}
        </TooltipContent>
      </Tooltip>
      <ThreadControlPassDialog
        contactInboxId={aiInbox.id}
        conversation={conversation}
        onOpenChange={setOpen}
        open={open}
        passTarget="aiAgent"
      />
    </>
  )
}
