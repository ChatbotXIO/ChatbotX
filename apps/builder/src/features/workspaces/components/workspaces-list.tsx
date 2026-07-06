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
import type { WorkspaceResource } from "../schema/resource"

type WorkspacesListProps = {
  user: {
    name: string | null
    email: string
    image: string | null
  }
  workspaces: WorkspaceResource[]
  workspacesLimit?: number | null
  isAtLimit?: boolean
  ownerWorkspaceIds?: string[]
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
        <TooltipTrigger asChild>
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
        </TooltipTrigger>
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
}

const WorkspaceCard = ({ workspace, ownerLabel }: WorkspaceCardProps) => {
  const firstLetter = workspace.name?.[0]?.toUpperCase() ?? ""
  const name = workspace.name ?? ""
  const href = `/space/${workspace.id}`

  return (
    <Card className={cn(CARD_STYLES, "relative")}>
      <CardContent className="px-0">
        {ownerLabel ? (
          <span className="absolute top-3 right-3 z-10 rounded-full bg-secondary px-2 py-0.5 font-medium text-[10px] text-secondary-foreground uppercase tracking-wide">
            {ownerLabel}
          </span>
        ) : null}
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
          <div className="line-clamp-2 px-3 text-center font-medium text-sm">
            {name}
          </div>
        </Link>
      </CardContent>
    </Card>
  )
}

const WorkspacesList = async ({
  user,
  workspaces,
  workspacesLimit,
  isAtLimit = false,
  ownerWorkspaceIds = [],
}: WorkspacesListProps) => {
  const t = await getTranslations()
  const createLabel = t("actions.createFeature", {
    feature: t("fields.workspace.label"),
  })
  const showCreateCard = !isCommunity()
  const ownerIds = new Set(ownerWorkspaceIds)
  const ownerLabel = t("home.owner")

  const usedCount = workspaces.length
  const hasLimit = typeof workspacesLimit === "number"
  const greetingName = user.name?.trim() || user.email
  const hasWorkspaces = workspaces.length > 0

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">
          {t("home.welcomeBack", { name: greetingName })}
        </h1>
        <p className="text-muted-foreground text-sm">{t("home.subtitle")}</p>
      </header>

      <div className="mt-8 flex items-baseline gap-3">
        <h2 className="font-semibold text-base">
          {t("billing.usage.workspaces")}
        </h2>
        {hasLimit && (
          <span
            className={cn(
              "font-medium text-muted-foreground text-sm tabular-nums",
              isAtLimit && "text-destructive",
            )}
          >
            {`${usedCount} / ${workspacesLimit}`}
          </span>
        )}
        {isAtLimit && isCloud() && (
          <UpgradePlanButton className="ml-auto" size="sm" variant="outline">
            <CrownIcon aria-hidden className="size-3.5" />
            {t("actions.upgradePlan")}
          </UpgradePlanButton>
        )}
      </div>

      {hasWorkspaces || showCreateCard ? (
        <ul className="mt-5 flex list-none flex-wrap gap-5 p-0">
          {showCreateCard && (
            <li className="list-none">
              <CreateWorkspaceCard
                disabled={isAtLimit}
                disabledReason={t("billing.limitReached.workspaces")}
                label={createLabel}
              />
            </li>
          )}
          {workspaces.map((workspace) => (
            <li className="list-none" key={workspace.id}>
              <WorkspaceCard
                ownerLabel={ownerIds.has(workspace.id) ? ownerLabel : undefined}
                workspace={workspace}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-muted-foreground text-sm">
          {t("home.noWorkspaces")}
        </p>
      )}
    </main>
  )
}

export default WorkspacesList
