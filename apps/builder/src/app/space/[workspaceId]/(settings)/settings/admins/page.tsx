import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { listWorkspaceMembers } from "@/features/workspace-members/queries"
import { getWorkspaceMembersSearchParamsCache } from "@/features/workspace-members/schema/query"
import { WorkspaceMembersTable } from "@/features/workspace-members/workspace-members-table"

export default async function SettingsAdminPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const t = await getTranslations()

  const promises = Promise.all([
    listWorkspaceMembers({
      workspaceId,
      ...getWorkspaceMembersSearchParamsCache.parse({}),
    }),
  ])

  return (
    <div className="space-y-4">
      <h2 className="font-bold text-xl">{t("admins.title")}</h2>
      <WorkspaceMembersTable promises={promises} />
    </div>
  )
}
