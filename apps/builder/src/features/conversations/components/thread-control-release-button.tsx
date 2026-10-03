"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { CircleCheckIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useThreadControl } from "../hooks/use-thread-control"
import { useThreadControlAction } from "../hooks/use-thread-control-action"
import type { ListConversationItemResource } from "../schema/resource"

/**
 * Header "Release" while this app owns the WhatsApp thread. No confirmation:
 * releasing is non-destructive (the next customer message re-routes it).
 * Icon-only below `md`, with the label kept in the tooltip and aria-label.
 */
export function ThreadControlReleaseButton({
  conversation,
}: {
  conversation: ListConversationItemResource
}) {
  const t = useTranslations()
  const threadControl = useThreadControl(conversation)
  const { execute, isExecuting } = useThreadControlAction({
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
  })

  if (!threadControl?.canRelease) {
    return null
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={t("conversationRouting.release.label")}
            className="shrink-0"
            disabled={isExecuting}
            onClick={() =>
              execute({
                contactInboxId: threadControl.contactInboxId,
                action: "release",
              })
            }
            size="sm"
            type="button"
            variant="outline"
          >
            {isExecuting ? (
              <Loader2Icon aria-hidden className="animate-spin" />
            ) : (
              <CircleCheckIcon aria-hidden />
            )}
            <span className="hidden md:inline">
              {t("conversationRouting.release.label")}
            </span>
          </Button>
        }
      />
      <TooltipContent>
        {t("conversationRouting.release.tooltip")}
      </TooltipContent>
    </Tooltip>
  )
}
