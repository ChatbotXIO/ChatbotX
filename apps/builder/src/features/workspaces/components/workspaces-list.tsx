import { isWorkspaceScheduledForDeletion } from "@chatbotx.io/business"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { CrownIcon, PlusCircleIcon } from "lucide-react"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { UpgradePlanButton } from "@/enterprise/features/billing/upgrade-plan-dialog"
import { isCloud, isCommunity } from "@/env"
import { formatScheduleTime } from "../helpers"
import type { WorkspaceResource } from "../schema/resource"
import { WorkspaceStatusSwitch } from "./workspace-status-switch"

type WorkspacesListProps = {
  user: {
    name: string | null
    email: string
    image: string | null
  }
  workspaces: WorkspaceResource[]
  isAtLimit?: boolean
  blocked?: boolean
  /** Why creation is blocked; picks the create-card copy. Defaults to the plan/trial message. */
  reason?: "status" | "mac" | null
  ownerWorkspaceIds?: string[]
  superAdminWorkspaceIds?: string[]
}

const CARD_STYLES =
  "group h-[220px] w-[180px] overflow-hidden rounded-xl border-border/60 py-0 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-md focus-within:ring-2 focus-within:ring-ring"
const LINK_STYLES =
  "flex h-[220px] w-full flex-col items-center justify-center gap-5 outline-none"

type CreateWorkspaceCardProps = {
  label: string
  disabled?: boolean
  disabledReason?: string
}

const CreateWorkspaceCard = ({
  label,
  disabled,
  disabledReason,
}: CreateWorkspaceCardProps) => {
  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Card
              aria-disabled
              className={cn(CARD_STYLES, "opacity-60 hover:translate-y-0")}
            >
              <CardContent className="px-0">
                <div
                  className={cn(
                    LINK_STYLES,
                    "cursor-not-allowed bg-muted text-muted-foreground",
                  )}
                >
                  <div className="flex size-16 items-center justify-center">
                    <PlusCircleIcon aria-hidden className="size-8" />
                  </div>
                  <div className="truncate text-center font-medium text-sm">
                    {label}
                  </div>
                </div>
              </CardContent>
            </Card>
          }
        />
        {disabledReason ? (
          <TooltipContent>{disabledReason}</TooltipContent>
        ) : null}
      </Tooltip>
    )
  }

  return (
    <Card className={cn(CARD_STYLES, "border-dashed")}>
      <CardContent className="px-0">
        <Link
          aria-label={label}
          className={cn(
            LINK_STYLES,
            "bg-primary/5 text-primary transition-colors group-hover:bg-primary/10",
          )}
          href="/channels/create"
        >
          <div className="flex size-16 items-center justify-center">
            <PlusCircleIcon aria-hidden className="size-8" />
          </div>
          <div className="truncate text-center font-medium text-sm">
            {label}
          </div>
        </Link>
      </CardContent>
    </Card>
  )
}

type WorkspaceCardProps = {
  workspace: WorkspaceResource
  ownerLabel?: string
  canManageStatus: boolean
  t: Awaited<ReturnType<typeof getTranslations>>
}

const WorkspaceCard = ({
  workspace,
  ownerLabel,
  canManageStatus,
  t,
}: WorkspaceCardProps) => {
  const firstLetter = workspace.name?.[0]?.toUpperCase() ?? ""
  const name = workspace.name ?? ""
  const href = `/space/${workspace.id}`
  const isScheduledForDeletion = isWorkspaceScheduledForDeletion(workspace)
  const activeHours =
    workspace.isActive && workspace.startTime && workspace.endTime
      ? t("workspace.schedule.activeHours", {
          startTime: formatScheduleTime(workspace.startTime),
          endTime: formatScheduleTime(workspace.endTime),
        })
      : null

  return (
    <Card className={cn(CARD_STYLES, "relative")}>
      <CardContent className="px-0">
        {ownerLabel ? (
          <span className="absolute end-3 top-3 z-10 rounded-full bg-secondary px-2 py-0.5 font-medium text-[10px] text-secondary-foreground uppercase tracking-wide">
            {ownerLabel}
          </span>
        ) : null}
        <WorkspaceStatusSwitch
          canManageStatus={canManageStatus}
          workspace={{
            id: workspace.id,
            isActive: workspace.isActive,
            startTime: workspace.startTime,
            endTime: workspace.endTime,
            scheduledDeletionAt: workspace.scheduledDeletionAt,
          }}
        />
        <Link
          aria-label={name}
          className={LINK_STYLES}
          href={href}
          title={name}
        >
          <Avatar className="size-16 transition-transform duration-200 group-hover:scale-105">
            <AvatarImage alt="" src={workspace.logo ?? ""} />
            <AvatarFallback className="rounded text-2xl">
              {firstLetter}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-0.5 px-3">
            <div className="line-clamp-2 text-center font-medium text-sm">
              {name}
            </div>
            {activeHours ? (
              <div className="line-clamp-1 text-center text-muted-foreground text-xs">
                {activeHours}
              </div>
            ) : null}
            {isScheduledForDeletion ? (
              <div className="line-clamp-1 text-center text-destructive text-xs">
                {t("workspace.deletion.badge")}
              </div>
            ) : null}
          </div>
        </Link>
      </CardContent>
    </Card>
  )
}

const WorkspacesList = async ({
  user,
  workspaces,
  isAtLimit = false,
  blocked = false,
  reason,
  ownerWorkspaceIds = [],
  superAdminWorkspaceIds = [],
}: WorkspacesListProps) => {
  const t = await getTranslations()
  const createLabel = t("actions.createFeature", {
    feature: t("fields.workspace.label"),
  })
  const showCreateCard = !isCommunity()
  const ownerIds = new Set(ownerWorkspaceIds)
  const superAdminIds = new Set(superAdminWorkspaceIds)
  const ownerLabel = t("home.owner")

  const usedCount = workspaces.length
  const greetingName = user.name?.trim() || user.email
  const hasWorkspaces = workspaces.length > 0

  return (
    // `4rem` is 2x the host page's `py-8` (top inset + matching bottom
    // inset), so it must move with that padding — same coupling rule as
    // the rail's fixed height in `account-rail.tsx`. This column uses
    // `max-h`, not `h`: a user with only a couple of workspaces should get
    // a naturally short column, not a tall mostly-empty one; `max-h` still
    // clips and scrolls once content actually overflows.
    <main className="flex min-w-0 flex-1 flex-col md:max-h-[calc(100vh-4rem)]">
      <header className="flex shrink-0 flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">
          {t("home.welcomeBack", { name: greetingName })}
        </h1>
        <p className="text-muted-foreground text-sm">{t("home.subtitle")}</p>
      </header>

      <div className="mt-8 flex shrink-0 items-baseline gap-3">
        <h2 className="font-semibold text-base">
          {t("billing.usage.workspaces")}
        </h2>
        <span className="font-medium text-muted-foreground text-sm tabular-nums">
          {usedCount}
        </span>
        {isAtLimit && isCloud() && (
          <UpgradePlanButton className="ms-auto" size="sm" variant="outline">
            <CrownIcon aria-hidden className="size-3.5" />
            {t("actions.upgradePlan")}
          </UpgradePlanButton>
        )}
      </div>

      {/*
        The scrollport for the card grid, kept independent from the header
        blocks above. `min-h-0` is required for this `flex-1` child to
        actually shrink and scroll instead of pushing past the `<main>`'s
        `max-h` — same requirement as the rail's own scrolling body in
        `account-rail.tsx`. `overscroll-contain` stops scroll-chaining into
        the document once the grid bottoms out.
      */}
      <div className="mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {hasWorkspaces || showCreateCard ? (
          <ul className="flex list-none flex-wrap gap-5 p-0 pb-1">
            {showCreateCard && (
              <li className="list-none">
                <CreateWorkspaceCard
                  disabled={isAtLimit || blocked}
                  disabledReason={
                    blocked
                      ? t(
                          reason === "mac"
                            ? "billing.macLimitReached.createDisabled"
                            : "billing.trialExpired.createDisabled",
                          { feature: t("fields.workspace.label") },
                        )
                      : t("billing.limitReached.workspaces")
                  }
                  label={createLabel}
                />
              </li>
            )}
            {workspaces.map((workspace) => (
              <li className="list-none" key={workspace.id}>
                <WorkspaceCard
                  canManageStatus={superAdminIds.has(workspace.id)}
                  ownerLabel={
                    ownerIds.has(workspace.id) ? ownerLabel : undefined
                  }
                  t={t}
                  workspace={workspace}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("home.noWorkspaces")}
          </p>
        )}
      </div>
    </main>
  )
}

export default WorkspacesList
