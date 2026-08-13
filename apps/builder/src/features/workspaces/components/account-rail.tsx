import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  CreditCardIcon,
  CrownIcon,
  Settings2Icon,
  ShieldCheckIcon,
  TicketIcon,
} from "lucide-react"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import type { QuotaMetric } from "@/components/usage-bars"
import { UsageBars } from "@/components/usage-bars"
import { UpgradePlanButton } from "@/enterprise/features/billing/upgrade-plan-dialog"
import { isCloud } from "@/env"
import { SignOut } from "@/features/auth/sign-out"
import { getTenantSettings } from "@/features/tenant/utils"
import { getUserAvatarUrl } from "@/lib/auth/avatar"
import { buildPlanNotice, buildUsageLabels } from "@/lib/quota-metrics"
import { resolveTrialMessage, trialMessageClassName } from "@/lib/trial-message"
import { EditProfileDialog } from "./edit-profile-dialog"
import { RefreshAllChannelTokensButton } from "./refresh-all-channel-tokens-button"

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

const railMenuItemClassName =
  // Duplicated from the portal's twin (apps/portal/src/features/layout/components/account-rail.tsx)
  // so drift between the two rails is easy to spot in a diff.
  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground outline-hidden transition-colors hover:bg-accent hover:text-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0"

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
  const initials = displayName.slice(0, 2).toUpperCase()
  const avatarUrl = getUserAvatarUrl(user.image, storageUrl)

  const usageLabels = buildUsageLabels(t)

  return (
    // `md:top-8` must match the host page's row padding (page.tsx's
    // `py-8`, i.e. 2rem), and the calc subtrahend must be 2x that value
    // (top inset + matching bottom inset). `md:h-` (not `md:max-h-`) is
    // deliberate: the rail is always full column height, sticky, and
    // scrolls internally once content overflows — do not swap this back
    // to `max-h`.
    <aside className="flex w-full shrink-0 flex-col rounded-xl border bg-card md:sticky md:top-8 md:h-[calc(100vh-4rem)] md:w-72">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-6 md:pb-2">
        <div className="relative flex items-center gap-3">
          <Avatar className="size-11">
            <AvatarImage alt={displayName} src={avatarUrl ?? ""} />
            <AvatarFallback className="rounded-full text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 flex-1 leading-tight">
            <span className="truncate font-semibold text-sm">
              {displayName}
            </span>
            <span className="truncate text-muted-foreground text-xs">
              {user.email}
            </span>
          </div>
          <EditProfileDialog className="absolute inset-e-0 top-0" user={user} />
        </div>

        {cloud && (
          <div className="flex flex-col gap-4 border-t pt-5">
            <div className="flex flex-col gap-3">
              <div className="grid gap-0.5">
                <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t("billing.plan.currentLabel")}
                </span>
                {/*
                  `wrap-break-word` rather than `truncate`: the rail is only
                  18rem wide and a plan name is the one string here the user
                  must be able to read in full, so it wraps to a second line
                  instead of being clipped with an ellipsis.
                */}
                <span className="wrap-break-word font-semibold text-base leading-tight">
                  {planName ?? t("billing.plan.free")}
                </span>
              </div>
              <UpgradePlanButton className="w-full" size="sm" variant="outline">
                <CrownIcon aria-hidden className="size-4" />
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

        {/*
          `mt-auto` is the layout's single flexible spacer — it pushes this
          menu block to the bottom of the scrollable body instead of sitting
          right under plan/usage. Exactly one `mt-auto` must exist in this
          component; a second one would split the free space and reopen the
          dead-gap bug this replaces.
        */}
        <div
          className={cn(
            "mt-auto flex flex-col gap-1",
            // Community edition with no super admin renders none of the
            // items below — skip the divider so it doesn't float with
            // nothing underneath it.
            (isSuperAdmin || cloud) && "border-t pt-4",
          )}
          id="account-rail-menu"
        >
          {isSuperAdmin && (
            <Link className={railMenuItemClassName} href="/admin">
              <ShieldCheckIcon aria-hidden className="size-4" />
              {t("actions.admin")}
            </Link>
          )}
          {cloud && isPlatformAdmin && (
            <Link className={railMenuItemClassName} href="/manage">
              <Settings2Icon aria-hidden className="size-4" />
              {t("actions.manage")}
            </Link>
          )}
          {/*
            Plain anchors, not next/link: these cross into the portal app via
            the OSS builder's proxy, so next/link prefetch is wasted and
            client-side navigation would fail. Mirrors the portal, where the
            cross-zone dashboard link is a plain anchor.
          */}
          {cloud && (
            <a className={railMenuItemClassName} href="/portal/billing">
              <CreditCardIcon aria-hidden className="size-4" />
              {t("actions.billing")}
            </a>
          )}
          {cloud && isPlatformContext && (
            <a className={railMenuItemClassName} href="/portal/redeem">
              <TicketIcon aria-hidden className="size-4" />
              {t("actions.redeem")}
            </a>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t p-6 pt-4">
        <RefreshAllChannelTokensButton />
        <SignOut />
      </div>
    </aside>
  )
}

export default AccountRail
