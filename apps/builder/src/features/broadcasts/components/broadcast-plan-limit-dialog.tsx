"use client"

import type { BroadcastPlanLimitReason } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { TriangleAlertIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { UpgradePlanDialog } from "@/enterprise/features/billing/upgrade-plan-dialog"
import type { BroadcastPlanLimitStep } from "../hooks/use-broadcast-plan-limit"

const descriptionKeyByReason = {
  sendRate: "broadcasts.planLimitDialog.sendRate",
  activeBroadcasts: "broadcasts.planLimitDialog.activeBroadcasts",
} as const satisfies Record<BroadcastPlanLimitReason, string>

export function BroadcastPlanLimitDialog({
  state,
  onOpenPricing,
  onDismiss,
}: {
  state: BroadcastPlanLimitStep
  onOpenPricing: () => void
  onDismiss: () => void
}) {
  const t = useTranslations()

  if (state.step === "closed") {
    return null
  }

  if (state.step === "pricing") {
    // The next activation reads the raw entitlement row, so the upgraded policy
    // applies as soon as the billing portal publishes the new entitlements.
    return (
      <UpgradePlanDialog
        onOpenChange={(open) => {
          if (!open) {
            onDismiss()
          }
        }}
        open
      />
    )
  }

  const { limit } = state.outcome

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onDismiss()
        }
      }}
      open
    >
      <DialogContent>
        <DialogHeader className="flex-row items-center gap-3 pe-8">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/25 dark:text-amber-500"
          >
            <TriangleAlertIcon className="size-5" />
          </span>
          <DialogTitle className="text-amber-600 dark:text-amber-500">
            {t("broadcasts.planLimitDialog.title")}
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-destructive leading-relaxed">
          {t(descriptionKeyByReason[limit.reason], {
            plan: limit.planName ?? t("billing.trial.planName"),
            rate: limit.displayedSendRatePerMinute,
            multiplier: limit.upgradeSpeedMultiplier,
            max: limit.maxActiveBroadcasts,
          })}
        </DialogDescription>
        <DialogFooter>
          <Button onClick={onDismiss} type="button" variant="outline">
            {t("actions.cancel")}
          </Button>
          <Button onClick={onOpenPricing} type="button">
            {t("actions.upgradePlan")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
