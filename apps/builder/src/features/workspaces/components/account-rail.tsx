import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { CrownIcon } from "lucide-react"
import { getTranslations } from "next-intl/server"
import type { QuotaMetric } from "@/components/usage-bars"
import { UsageBars } from "@/components/usage-bars"
import { UpgradePlanButton } from "@/enterprise/features/billing/upgrade-plan-dialog"
import { isCloud } from "@/env"
import { SignOut } from "@/features/auth/sign-out"
import { buildPlanNotice, buildUsageLabels } from "@/lib/quota-metrics"
import { resolveTrialMessage, trialMessageClassName } from "@/lib/trial-message"

type AccountRailProps = {
  user: {
    name: string | null
    email: string
    image: string | null
  }
  planName?: string | null
  metrics?: QuotaMetric[]
  planStatus?: string | null
  /** ISO date of the self-managed trial end, or null when not on a trial. */
  trialEndsAt?: string | null
}

export const AccountRail = async ({
  user,
  planName,
  metrics = [],
  planStatus = null,
  trialEndsAt = null,
}: AccountRailProps) => {
  const t = await getTranslations()
  const cloud = isCloud()
  const notice = buildPlanNotice(planStatus, trialEndsAt)
  const displayName = user.name?.trim() || user.email
  const initials = displayName.slice(0, 2).toUpperCase()

  const usageLabels = buildUsageLabels(t)

  return (
    <aside className="flex w-full shrink-0 flex-col gap-6 rounded-xl border bg-card p-6 md:w-72">
      <div className="flex items-center gap-3">
        <Avatar className="size-11">
          <AvatarImage alt={displayName} src={user.image ?? ""} />
          <AvatarFallback className="rounded-full text-sm">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="grid min-w-0 flex-1 leading-tight">
          <span className="truncate font-semibold text-sm">{displayName}</span>
          <span className="truncate text-muted-foreground text-xs">
            {user.email}
          </span>
        </div>
      </div>

      {cloud && (
        <div className="flex flex-col gap-4 border-t pt-5">
          <div className="mb-3 flex flex-col items-start justify-between gap-2">
            <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              {t("billing.plan.label", {
                plan: planName ?? t("billing.plan.free"),
              })}
            </span>
            <UpgradePlanButton size="sm" variant="outline">
              <CrownIcon aria-hidden className="size-3.5" />
              {t("actions.upgradePlan")}
            </UpgradePlanButton>
          </div>
          {metrics.length > 0 && (
            <UsageBars labels={usageLabels} metrics={metrics} />
          )}
          {notice?.kind === "trial" && (
            <p
              className={cn(
                "text-xs",
                trialMessageClassName(notice.info.level),
              )}
            >
              {resolveTrialMessage(notice.info, t)}
            </p>
          )}
          {notice?.kind === "pastDue" && (
            <p className="text-destructive text-xs">
              {t("billing.pastDue.message")}
            </p>
          )}
        </div>
      )}

      <div className="mt-auto border-t pt-4">
        <SignOut />
      </div>
    </aside>
  )
}

export default AccountRail
