import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { PlusCircleIcon } from "lucide-react"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { isCommunity } from "@/env"
import type { WorkspaceResource } from "../schema/resource"

type WorkspacesListProps = {
  workspaces: WorkspaceResource[]
}

const CARD_STYLES = "h-[250px] w-[200px] py-0 rounded-md overflow-hidden"
const LINK_STYLES =
  "flex h-[250px] w-full flex-col items-center justify-center gap-6"

type CreateWorkspaceCardProps = {
  label: string
}

const CreateWorkspaceCard = ({ label }: CreateWorkspaceCardProps) => (
  <Card className={CARD_STYLES}>
    <CardContent className="px-0">
      <Link
        aria-label={label}
        className={cn(LINK_STYLES, "bg-primary text-primary-foreground")}
        href="/channels/create"
      >
        <div className="flex size-20 items-center justify-center">
          <PlusCircleIcon aria-hidden className="size-8" />
        </div>
        <div className="truncate text-center font-medium">{label}</div>
      </Link>
    </CardContent>
  </Card>
)

type WorkspaceCardProps = {
  workspace: WorkspaceResource
}

const WorkspaceCard = ({ workspace }: WorkspaceCardProps) => {
  const firstLetter = workspace.name?.[0] ?? ""
  const name = workspace.name ?? ""
  const href = `/space/${workspace.id}/dashboard`

  return (
    <Card className={CARD_STYLES}>
      <CardContent className="px-0">
        <Link
          aria-label={name}
          className={LINK_STYLES}
          href={href}
          title={name}
        >
          <Avatar className="size-20">
            <AvatarImage alt="" src={workspace.logo ?? ""} />
            <AvatarFallback className="rounded text-2xl">
              {firstLetter}
            </AvatarFallback>
          </Avatar>
          <div className="truncate text-center font-medium">{name}</div>
        </Link>
      </CardContent>
    </Card>
  )
}

const WorkspacesList = async ({ workspaces }: WorkspacesListProps) => {
  const t = await getTranslations()
  const createLabel = t("actions.createFeature", {
    feature: t("fields.workspace.label"),
  })
  const showCreateCard = !isCommunity || workspaces.length === 0

  return (
    <div className="flex min-h-dvh w-full max-w-full justify-start px-20">
      <ul className="mt-20 flex list-none flex-wrap gap-6 p-0">
        {showCreateCard && (
          <li className="list-none">
            <CreateWorkspaceCard label={createLabel} />
          </li>
        )}
        {workspaces.map((workspace) => (
          <li className="list-none" key={workspace.id}>
            <WorkspaceCard workspace={workspace} />
          </li>
        ))}
      </ul>
    </div>
  )
}

export default WorkspacesList
