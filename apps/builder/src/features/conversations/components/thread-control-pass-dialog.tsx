"use client"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useRef } from "react"
import {
  THREAD_CONTROL_PASS_COPY_KEYS,
  type ThreadControlPassTarget,
} from "@/features/messages/lib/thread-control-channel-ui"
import { useThreadControlAction } from "../hooks/use-thread-control-action"
import type { ListConversationItemResource } from "../schema/resource"

/**
 * The confirmation behind every "pass" entry point (the actions menu item and
 * the header button). It hands the thread away, so it always asks first. The
 * copy follows who the channel passes to; the trigger stays with the caller.
 */
export function ThreadControlPassDialog({
  conversation,
  contactInboxId,
  passTarget,
  open,
  onOpenChange,
}: {
  conversation: ListConversationItemResource
  contactInboxId: string
  passTarget: ThreadControlPassTarget
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const copy = THREAD_CONTROL_PASS_COPY_KEYS[passTarget]
  const { execute, isExecuting } = useThreadControlAction({
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    passTarget,
  })

  // Close once the pass settles; a failure keeps its toast and lets the
  // agent retry.
  const wasExecutingRef = useRef(false)
  useEffect(() => {
    if (wasExecutingRef.current && !isExecuting) {
      onOpenChange(false)
    }
    wasExecutingRef.current = isExecuting
  }, [isExecuting, onOpenChange])

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(copy.title)}</AlertDialogTitle>
          <AlertDialogDescription>{t(copy.description)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isExecuting}>
            {t("actions.cancel")}
          </AlertDialogCancel>
          <Button
            disabled={isExecuting}
            onClick={() => execute({ contactInboxId, action: "pass" })}
            type="button"
          >
            {isExecuting && (
              <Loader2Icon aria-hidden className="animate-spin" />
            )}
            {t(copy.confirm)}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
