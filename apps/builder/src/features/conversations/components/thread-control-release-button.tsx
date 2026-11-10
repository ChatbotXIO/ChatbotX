"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { ArrowRightLeftIcon, CircleCheckIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { type ReactNode, useEffect, useState } from "react"
import { useThreadControl } from "../hooks/use-thread-control"
import { useThreadControlAction } from "../hooks/use-thread-control-action"
import type { ListConversationItemResource } from "../schema/resource"
import { offersPartnerPass } from "../utils/thread-control"
import { ThreadControlPassPartnerDialog } from "./thread-control-pass-partner-dialog"

type ReleaseControlsProps = {
  isExecuting: boolean
  onRelease: () => void
}

/** Plain "Release", icon-only below `md` with the label kept in the tooltip. */
function ReleaseButton({ isExecuting, onRelease }: ReleaseControlsProps) {
  const t = useTranslations()

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={t("conversationRouting.release.label")}
            className="shrink-0"
            disabled={isExecuting}
            onClick={onRelease}
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

/** A menu choice with its explanation always visible under the label. */
function DescribedMenuItem({
  icon,
  label,
  description,
  onClick,
}: {
  icon: ReactNode
  label: string
  description: string
  onClick: () => void
}) {
  return (
    <DropdownMenuItem className="items-start" onClick={onClick}>
      <span className="mt-0.5">{icon}</span>
      <span className="flex flex-col gap-0.5">
        <span>{label}</span>
        <span className="text-muted-foreground text-xs">{description}</span>
      </span>
    </DropdownMenuItem>
  )
}

/** One icon that offers "Release" or "Pass to a partner" when both are possible. */
function ReleaseOrPassMenu({
  isExecuting,
  onRelease,
  onPass,
}: ReleaseControlsProps & { onPass: () => void }) {
  const t = useTranslations()

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label={t("conversationRouting.release.menu")}
                  className="shrink-0"
                  disabled={isExecuting}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {isExecuting ? (
                    <Loader2Icon aria-hidden className="animate-spin" />
                  ) : (
                    <ArrowRightLeftIcon aria-hidden />
                  )}
                </Button>
              }
            />
          }
        />
        <TooltipContent>{t("conversationRouting.release.menu")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-72">
        <DescribedMenuItem
          description={t("conversationRouting.release.tooltip")}
          icon={<CircleCheckIcon aria-hidden />}
          label={t("conversationRouting.release.label")}
          onClick={onRelease}
        />
        <DescribedMenuItem
          description={t("conversationRouting.pass.description")}
          icon={<ArrowRightLeftIcon aria-hidden />}
          label={t("conversationRouting.pass.menuItem")}
          onClick={onPass}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Header control while this app owns the thread. No confirmation to release:
 * it is non-destructive (the next customer message re-routes it). Where the
 * thread can also be passed to a partner role, the button becomes a small menu
 * with both choices. The pass dialog sits beside the menu, not inside it, so
 * keys typed in its note never reach the menu's typeahead.
 */
export function ThreadControlReleaseButton({
  conversation,
}: {
  conversation: ListConversationItemResource
}) {
  const [isPassDialogOpen, setIsPassDialogOpen] = useState(false)
  const threadControl = useThreadControl(conversation)
  const { execute, isExecuting } = useThreadControlAction({
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
  })

  const canOfferPass = Boolean(
    threadControl?.canRelease && offersPartnerPass(threadControl),
  )

  // Losing the thread unmounts the dialog but not this state: without the
  // reset, getting the thread back would pop the dialog open again.
  useEffect(() => {
    if (!canOfferPass) {
      setIsPassDialogOpen(false)
    }
  }, [canOfferPass])

  if (!threadControl?.canRelease) {
    return null
  }

  const release = () =>
    execute({ contactInboxId: threadControl.contactInboxId, action: "release" })

  if (!offersPartnerPass(threadControl)) {
    return <ReleaseButton isExecuting={isExecuting} onRelease={release} />
  }

  return (
    <>
      <ReleaseOrPassMenu
        isExecuting={isExecuting}
        onPass={() => setIsPassDialogOpen(true)}
        onRelease={release}
      />
      <ThreadControlPassPartnerDialog
        channel={threadControl.channel}
        contactInboxId={threadControl.contactInboxId}
        conversation={conversation}
        inboxId={threadControl.inboxId}
        onOpenChange={setIsPassDialogOpen}
        open={isPassDialogOpen}
        ownerRole={threadControl.ownerRole}
      />
    </>
  )
}
