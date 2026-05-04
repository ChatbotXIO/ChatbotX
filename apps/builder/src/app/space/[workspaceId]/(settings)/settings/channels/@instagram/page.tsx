import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { InstagramManage } from "@/features/integration-instagram/components/instagram-manage"
import { listIntegrationInstagrams } from "@/features/integration-instagram/queries"
import { organizationService } from "@/features/organization/services"
import { workspaceService } from "@/features/workspaces/workspace-service"

export default async function SettingChannelInstagramPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const params = await props.params

  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const workspace = await workspaceService.findOrFail({
    where: { id: workspaceId },
  })
  const organization = await organizationService.findOrFail({
    where: { id: workspace.organizationId },
  })
  const promises = Promise.all([
    listIntegrationInstagrams({
      workspaceId: params.workspaceId,
    }),
  ])

  return (
    <InstagramManage
      promises={promises}
      settings={organization.settings.instagram}
      workspaceId={workspaceId}
    />
  )
}
