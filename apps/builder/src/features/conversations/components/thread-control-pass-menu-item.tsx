"use client"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { DropdownMenuItem } from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { ArrowRightLeftIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useRef, useState } from "react"
import { useTenantSettings } from "@/features/tenant/tenant-settings-provider"
import { useThreadControl } from "../hooks/use-thread-control"
import { useThreadControlAction } from "../hooks/use-thread-control-action"
import type { ListConversationItemResource } from "../schema/resource"

/**
 * "Pass to escalation" in the conversation's action menu, behind a
 * confirmation because it hands the thread away. Rendered only while this app
 * owns the thread and is not itself the escalation partner (Meta forbids an
 * escalation owner from passing to escalation).
 */
export function ThreadControlPassMenuItem({
  conversation,
}: {
  conversation: ListConversationItemResource
}) {
  const threadControl = useThreadControl(conversation)
  if (!threadControl?.canPass) {
    return null
  }
  return (
    <PassMenuItemWithDialog
      contactInboxId={threadControl.contactInboxId}
      conversation={conversation}
    />
  )
}

function PassMenuItemWithDialog({
  conversation,
  contactInboxId,
}: {
  conversation: ListConversationItemResource
  contactInboxId: string
}) {
  const t = useTranslations()
  const { name: brand } = useTenantSettings()
  const [open, setOpen] = useState(false)
  const { execute, isExecuting } = useThreadControlAction({
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
  })

  // Close once the pass settles; a failure keeps its toast and lets the
  // agent retry from the menu.
  const wasExecutingRef = useRef(false)
  useEffect(() => {
    if (wasExecutingRef.current && !isExecuting) {
      setOpen(false)
    }
    wasExecutingRef.current = isExecuting
  }, [isExecuting])

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger
        // The trigger is a menu item, not a native <button>.
        nativeButton={false}
        render={
          <DropdownMenuItem
            closeOnClick={false}
            onClick={(event) => event.preventDefault()}
          >
            <ArrowRightLeftIcon />
            {t("conversationRouting.pass.menuItem")}
          </DropdownMenuItem>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("conversationRouting.pass.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("conversationRouting.pass.description", { brand })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isExecuting}>
            {t("actions.cancel")}
          </AlertDialogCancel>
          <Button
            disabled={isExecuting}
            onClick={() =>
              execute({
                contactInboxId,
                action: "pass",
              })
            }
            type="button"
          >
            {isExecuting && (
              <Loader2Icon aria-hidden className="animate-spin" />
            )}
            {t("conversationRouting.pass.confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
