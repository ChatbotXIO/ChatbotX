import { organizationService, workspaceService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { listIntegrationZalo } from "@/features/integration-zalo/queries"
import { ZaloManage } from "@/features/integration-zalo/zalo-manage"

export default async function SettingChannelZaloPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const workspace = await workspaceService.findOrFail({
    where: { id: workspaceId },
  })
  const organization = await organizationService.findOrFail({
    where: { id: workspace.organizationId },
  })
  const hasZaloSettings = Boolean(organization.settings?.zalo?.clientId)

  const promises = Promise.all([
    listIntegrationZalo({
      where: { workspaceId },
    }),
  ])

  return (
    <ZaloManage
      isEnabled={hasZaloSettings}
      promises={promises}
      workspaceId={workspaceId}
    />
  )
}
