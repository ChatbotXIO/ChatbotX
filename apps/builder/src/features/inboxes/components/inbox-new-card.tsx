"use client"

import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { PlusCircleIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"

const CARD_STYLES =
  "flex h-14 w-full items-center justify-center gap-2 text-sm transition-colors"

export default function InboxNewCard({
  workspaceId,
  blocked = false,
  reason,
}: {
  workspaceId: string
  blocked?: boolean
  /** Why creation is blocked; picks the tooltip copy. Defaults to the plan/trial message. */
  reason?: "status" | "mac" | null
}) {
  const t = useTranslations()
  const disabledReason = t(
    reason === "mac"
      ? "billing.macLimitReached.createDisabled"
      : "billing.trialExpired.createDisabled",
    { feature: t("fields.inbox.label") },
  )

  if (blocked) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Card aria-disabled className="items-center justify-center py-0">
              <CardContent className="justify-middle flex h-full w-full flex-wrap items-center gap-2 px-0">
                <span
                  className={cn(
                    CARD_STYLES,
                    "cursor-not-allowed text-muted-foreground",
                  )}
                >
                  <PlusCircleIcon className="h-4 w-4" />
                  {t("actions.createFeature", {
                    feature: t("fields.inbox.label"),
                  })}
                </span>
              </CardContent>
            </Card>
          }
        />
        <TooltipContent>{disabledReason}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Card className="items-center justify-center py-0">
      <CardContent className="justify-middle flex h-full w-full flex-wrap items-center gap-2 px-0">
        <Link
          className={CARD_STYLES}
          href={`/channels/create?workspaceId=${workspaceId}`}
        >
          <PlusCircleIcon className="h-4 w-4" />
          {t("actions.createFeature", { feature: t("fields.inbox.label") })}
        </Link>
      </CardContent>
    </Card>
  )
}
