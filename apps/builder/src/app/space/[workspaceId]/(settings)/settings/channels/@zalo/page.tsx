import {
  platformCredentialService,
  workspaceService,
} from "@chatbotx.io/business"
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

  const workspace = await workspaceService.find({ where: { id: workspaceId } })
  if (!workspace) {
    return notFound()
  }
  const credential = await platformCredentialService.resolveForOwner({
    ownerId: workspace.ownerId,
    type: "zalo",
  })
  const hasZaloSettings = Boolean(credential?.publicConfig.clientId)

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
