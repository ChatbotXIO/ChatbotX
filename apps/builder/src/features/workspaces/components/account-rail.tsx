import {
  type AccountRailItem,
  AccountRail as AccountRailShell,
} from "@chatbotx.io/account-ui/components/account-rail"
import {
  UsageBars,
  type UsageMetric,
} from "@chatbotx.io/account-ui/components/usage-bars"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  CreditCardIcon,
  CrownIcon,
  Settings2Icon,
  ShieldCheckIcon,
  TicketIcon,
} from "lucide-react"
import { getTranslations } from "next-intl/server"
import { UpgradePlanButton } from "@/enterprise/features/billing/upgrade-plan-dialog"
import { isCloud } from "@/env"
import { SignOut } from "@/features/auth/sign-out"
import { getTenantSettings } from "@/features/tenant/utils"
import { getUserAvatarUrl } from "@/lib/auth/avatar"
import type { QuotaMetric } from "@/lib/quota-metrics"
import { buildPlanNotice, buildUsageLabels } from "@/lib/quota-metrics"
import { resolveTrialMessage, trialMessageClassName } from "@/lib/trial-message"
import { EditProfileDialog } from "./edit-profile-dialog"

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
  isSuperAdmin?: boolean
  isPlatformAdmin?: boolean
  /**
   * True only when the request resolved to the platform host (see
   * `resolveTenantByDomain` in `page.tsx`). Gates the Redeem link:
   * `/portal/redeem` calls `notFound()` on any non-platform (reseller) host,
   * so linking to it there would send the user to a 404. Deliberately NOT
   * resolved inside this component, matching the portal's `AccountRail`
   * rationale for the same prop.
   */
  isPlatformContext?: boolean
}

function toUsageMetrics(
  metrics: QuotaMetric[],
  labels: Record<QuotaMetric["key"], string>,
): UsageMetric[] {
  return metrics.map((metric) => ({
    key: metric.key,
    label: labels[metric.key],
    used: metric.used,
    limit: metric.limit,
    workspaceUsed: metric.workspaceUsed,
  }))
}

export const AccountRail = async ({
  user,
  planName,
  metrics = [],
  planStatus = null,
  trialEndsAt = null,
  isSuperAdmin = false,
  isPlatformAdmin = false,
  isPlatformContext = false,
}: AccountRailProps) => {
  const [t, { storageUrl }] = await Promise.all([
    getTranslations(),
    getTenantSettings(),
  ])
  const cloud = isCloud()
  const notice = buildPlanNotice(planStatus, trialEndsAt)
  const displayName = user.name?.trim() || user.email
  const avatarUrl = getUserAvatarUrl(user.image, storageUrl)
  const usageLabels = buildUsageLabels(t)

  const items: AccountRailItem[] = [
    ...(isSuperAdmin
      ? [
          {
            key: "admin",
            label: t("actions.admin"),
            href: "/admin",
            icon: ShieldCheckIcon,
          },
        ]
      : []),
    ...(cloud && isPlatformAdmin
      ? [
          {
            key: "manage",
            label: t("actions.manage"),
            href: "/manage",
            icon: Settings2Icon,
          },
        ]
      : []),
    // Plain anchors, not next/link: these cross into the portal app via the
    // OSS builder's proxy, so next/link prefetch is wasted and client-side
    // navigation would fail. Mirrors the portal, where the cross-zone
    // dashboard link is a plain anchor.
    {
      key: "billing",
      label: t("actions.billing"),
      href: "/portal/billing",
      icon: CreditCardIcon,
      external: true,
    },
    ...(isPlatformContext
      ? [
          {
            key: "redeem",
            label: t("actions.redeem"),
            href: "/portal/redeem",
            icon: TicketIcon,
            external: true,
          },
        ]
      : []),
  ]

  const planBlock = cloud ? (
    <div className="flex flex-col gap-4 border-t pt-5">
      <div className="mb-3 flex items-center justify-between gap-2">
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
        <UsageBars metrics={toUsageMetrics(metrics, usageLabels)} />
      )}
      {notice?.kind === "trial" && (
        <p className={cn("text-xs", trialMessageClassName(notice.info.level))}>
          {resolveTrialMessage(notice.info, t)}
        </p>
      )}
      {notice?.kind === "pastDue" && (
        <p className="text-destructive text-xs">
          {t("billing.pastDue.message")}
        </p>
      )}
    </div>
  ) : undefined

  return (
    <AccountRailShell
      footer={<SignOut />}
      headerAction={
        <EditProfileDialog className="absolute inset-e-0 top-0" user={user} />
      }
      items={items}
      planBlock={planBlock}
      user={{
        displayName,
        email: user.email,
        avatarUrl: avatarUrl ?? "",
      }}
    />
  )
}

export default AccountRail
