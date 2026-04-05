import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { PlusCircleIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { isCommunity } from "@/env"
import type { WorkspaceResource } from "../schema/resource"

type WorkspacesListProps = {
  workspaces: WorkspaceResource[]
}

const CARD_STYLES = "h-[250px] w-[200px] py-0 rounded-md overflow-hidden"
const LINK_STYLES =
  "flex h-[250px] w-full flex-col flex-wrap items-center justify-center gap-6"

const CreateChatbotCard = () => {
  const t = useTranslations()

  return (
    <Card className={CARD_STYLES}>
      <CardContent className="px-0">
        <Link
          className={cn(LINK_STYLES, "bg-primary text-primary-foreground")}
          href="/channels/create"
        >
          <div className="flex size-20 items-center justify-center">
            <PlusCircleIcon className="size-8" />
          </div>
          <div className="truncate text-center font-medium">
            {t("actions.createFeature", {
              feature: t("fields.workspace.label"),
            })}
          </div>
        </Link>
      </CardContent>
    </Card>
  )
}

type ChatbotCardProps = {
  workspace: WorkspaceResource
}

const ChatbotCard = ({ workspace }: ChatbotCardProps) => {
  const firstLetter = workspace.name?.[0] ?? ""

  return (
    <Card className={CARD_STYLES}>
      <CardContent className="px-0">
        <Link className={LINK_STYLES} href={`/space/${workspace.id}/dashboard`}>
          <Avatar className="size-20">
            <AvatarImage alt={workspace.name} src={workspace.logo ?? ""} />
            <AvatarFallback className="rounded text-2xl">
              {firstLetter}
            </AvatarFallback>
          </Avatar>
          <div className="truncate text-center font-medium">
            {workspace.name}
          </div>
        </Link>
      </CardContent>
    </Card>
  )
}

const WorkspacesList = ({ workspaces }: WorkspacesListProps) => (
  <div className="flex h-screen w-screen justify-start px-20">
    <div className="mt-20 flex flex-wrap gap-6">
      {isCommunity && workspaces.length === 0 && <CreateChatbotCard />}

      {workspaces?.map((workspace) => (
        <ChatbotCard key={workspace.id} workspace={workspace} />
      ))}
    </div>
  </div>
)

export default WorkspacesList
